const fsPromises = require('fs').promises;
const { parse } = require('csv-parse');
const yaml = require('js-yaml');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const ProgressBar = require('progress');
const { stringify } = require('csv-stringify/sync');
const { createReadStream } = require('fs');
const TurndownService = require('turndown');
const cheerio = require('cheerio');

require('dotenv').config();

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});


// @ts-ignore
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig: { response_mime_type: "application/json" },
});

const jsonSchema = {
    "type": "object",
    "properties": {
        "isModel": {
            "type": "boolean",
            "description": "Is it a biological model?"
        },
        "isDatabase": {
            "type": "boolean",
            "description": "Is it a biological database?"
        },
        "Input": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "Output": {
            "type": "array",
            "items": {
                "type": "string"
            }
        }
    },
    "required": [
        "isModel",
        "isDatabase",
        "Input",
        "Output"
    ]
}

async function loadConfig(configFile) {
    const fileContents = await fsPromises.readFile(configFile, 'utf8');
    return yaml.load(fileContents);
}

async function readPromptFromFile(filePath) {
    try {
        return await fsPromises.readFile(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading prompt file: ${error.message}`);
        return null;
    }
}


async function urlToMarkdown(url) {
    try {
        const cleanUrl = url.replace(/^["'](.*)["']$/, '$1');
        const response = await axios.get(cleanUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data;

        // Use cheerio to parse the HTML and extract the main content
        const $ = cheerio.load(html);

        // Remove script tags, style tags, and meta tags
        $('script, style, meta').remove();

        // Extract the main content (adjust the selector as needed)
        const mainContent = $('body').html();

        // Convert the main content to Markdown
        const markdown = turndownService.turndown(mainContent);

        return markdown.trim();
    } catch (error) {
        console.error(`Error processing ${url}: ${error.message}`);
        return null;
    }
}

async function sendToGeminiPro(markdown, promptTemplate) {
    try {
        let prompt = promptTemplate.replace('{JsonSchema}', JSON.stringify(jsonSchema)).
            replace('{markdown}', markdown);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = response.text();

        // Parse the JSON output
        let parsedOutput;
        try {
            parsedOutput = JSON.parse(generatedText);
            //console.log(generatedText, "-->", parsedOutput)
            // Validate the parsed output against our expected schema
            if (typeof parsedOutput.isModel !== 'boolean' ||
                typeof parsedOutput.isDatabase !== 'boolean' ||
                !Array.isArray(parsedOutput.Input) ||
                !Array.isArray(parsedOutput.Output)) {
                throw new Error('Invalid JSON structure');
            }
        } catch (parseError) {
            console.error('Error parsing Gemini output as JSON:', parseError);
            console.error('Used Prompt:', prompt);
            console.error('Generated Text:', generatedText);
            parsedOutput = {
                IsModel: false,
                IsDatabase: false,
                Input: [],
                Output: [],
                Error: generatedText,
            };
        }

        return parsedOutput;
    } catch (error) {
        console.error('Error calling Gemini Pro:', error);
        console.error('Used Prompt:', prompt);
        return {
            IsModel: false,
            IsDatabase: false,
            Input: [],
            Output: [],
            Error: error.message
        };
    }
}

async function processCSV(inputFilePath, outputFilePath, promptTemplate, batchSize = 10) {
    const parser = createReadStream(inputFilePath).pipe(parse({
        columns: true,
        skip_empty_lines: true
    }));

    const outputStream = await fsPromises.open(outputFilePath, 'w');
    let isHeaderWritten = false;

    const rows = [];
    let totalRows = 0;

    for await (const row of parser) {
        rows.push(row);
        totalRows++;

        if (rows.length >= batchSize) {
            await processBatch(rows, outputStream, promptTemplate, isHeaderWritten);
            isHeaderWritten = true;
            rows.length = 0; // Clear the array
            // if (totalRows == batchSize * 2)
            //     break
        }
    }

    // Process any remaining rows
    if (rows.length > 0) {
        await processBatch(rows, outputStream, promptTemplate, isHeaderWritten);
    }

    await outputStream.close();
    console.log(`CSV file successfully processed and saved to ${outputFilePath}`);
}


async function processBatch(rows, outputFilePath, promptTemplate, isHeaderWritten) {
    const bar = new ProgressBar('Processing [:bar] :current/:total :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: rows.length
    });

    const batchPromises = rows.map(async (row) => {
        if (row.URL) {
            try {
                const markdown = await urlToMarkdown(row.URL);
                if (markdown) {
                    const geminiResponse = await sendToGeminiPro(markdown, promptTemplate);

                    // Parse the Gemini response if it's a string
                    let parsedResponse = typeof geminiResponse === 'string'
                        ? JSON.parse(geminiResponse)
                        : geminiResponse;

                    // Check for Error field in Gemini response
                    if (parsedResponse.Error && parsedResponse.Error.trim() !== '') {
                        console.error(`Error in Gemini response for URL ${row.URL}: ${parsedResponse.Error}`);
                    }

                    // Function to join array elements or return empty string if not an array
                    const joinArray = (arr) => Array.isArray(arr) ? arr.join(';') : '';

                    return {
                        ...row,
                        isModel: parsedResponse.isModel,
                        isDatabase: parsedResponse.isDatabase,
                        Input: joinArray(parsedResponse.Input),
                        Output: joinArray(parsedResponse.Output),
                        Error: parsedResponse.Error || ''
                    };
                }
            } catch (error) {
                console.error(`Error processing ${row.URL}: ${error.message}`);
                return {
                    ...row,
                    isModel: false,
                    isDatabase: false,
                    Input: '',
                    Output: '',
                    Error: error.message
                };
            }
        }
        return {
            ...row,
            isModel: false,
            isDatabase: false,
            Input: '',
            Output: '',
            Error: 'No URL provided'
        };
    });

    const batchResults = await Promise.all(batchPromises);

    const csvString = stringify(batchResults, {
        header: !isHeaderWritten,
        columns: [
            ...Object.keys(rows[0]),
            'isModel',
            'isDatabase',
            'Input',
            'Output',
            'Error'
        ]
    });

    // Append the results to the file
    await fsPromises.appendFile(outputFilePath, csvString);
    bar.tick(rows.length);
}


// Main execution
async function main() {
    const config = await loadConfig('config.yaml');
    const { prompt_file, in_notion, out_notion } = config;

    const promptTemplate = await readPromptFromFile(prompt_file);
    if (!promptTemplate) {
        console.error('Failed to read prompt template. Exiting.');
        return;
    }

    await processCSV(in_notion, out_notion, promptTemplate);
}


// Export functions and main
module.exports = {
    urlToMarkdown,
    main
};

// Only run main if this script is run directly (not imported)
if (require.main === module) {
    main().catch(console.error);
}