const { Client } = require('@notionhq/client');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const csv = require('csv-writer').createObjectCsvWriter;
const ProgressBar = require('progress');
require('dotenv').config();

async function loadConfig(configFile) {
    const fileContents = await fs.readFile(configFile, 'utf8');
    return yaml.load(fileContents);
}

async function getNotionData(notionClient, databaseId, filterTag, tagColumnName, fieldsToExtract) {
    let allResults = [];
    let hasMore = true;
    let nextCursor = undefined;
    let bar;

    while (hasMore) {
        const response = await notionClient.databases.query({
            database_id: databaseId,
            filter: {
                property: tagColumnName,
                select: {
                    equals: filterTag
                }
            },
            start_cursor: nextCursor,
            page_size: 100  // Maximum allowed by Notion API
        });

        allResults = allResults.concat(response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor;

        if (!bar && response.results.length > 0) {
            const totalPages = Math.ceil(allResults.length / response.results.length) * response.results.length;
            bar = new ProgressBar('Fetching data [:bar] :current/:total pages', {
                total: totalPages,
                width: 30,
                complete: '=',
                incomplete: ' '
            });
        }

        if (bar) {
            bar.tick(response.results.length);
        }
    }

    console.log('\nProcessing fetched data...');

    return allResults.map(page => {
        const pageData = {
            'Page URL': `https://www.notion.so/${page.id.replace(/-/g, '')}`
        };
        for (const field of fieldsToExtract) {
            if (field in page.properties) {
                const property = page.properties[field];
                switch (property.type) {
                    case 'rich_text':
                        pageData[field] = property.rich_text.length > 0 ? property.rich_text[0].plain_text : '';
                        break;
                    case 'title':
                        pageData[field] = property.title.length > 0 ? property.title[0].plain_text : '';
                        break;
                    case 'select':
                        pageData[field] = property.select ? property.select.name : '';
                        break;
                    case 'multi_select':
                        pageData[field] = property.multi_select.map(item => item.name).join(', ');
                        break;
                    default:
                        pageData[field] = JSON.stringify(property[property.type]);
                }
            }
        }
        return pageData;
    });
}

async function saveToCsv(data, outputFile) {
    if (!data || data.length === 0) {
        console.log("No data to save.");
        return;
    }

    const csvWriter = csv({
        path: outputFile,
        header: Object.keys(data[0]).map(key => ({ id: key, title: key }))
    });

    await csvWriter.writeRecords(data);
}

async function main() {
    const notionToken = process.env.NOTION_TOKEN;
    const config = await loadConfig('config.yaml');
    const { database_id, filter_tag, tag_column_name, fields_to_extract, in_notion } = config;

    const notion = new Client({ auth: notionToken });

    try {
        console.log("Fetching data from Notion...");
        const extractedData = await getNotionData(notion, database_id, filter_tag, tag_column_name, fields_to_extract);
        console.log(`Fetched ${extractedData.length} records.`);

        console.log("Saving data to CSV...");
        await saveToCsv(extractedData, in_notion);
        console.log(`Data extracted and saved to ${in_notion}`);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();