const { urlToMarkdown } = require('./notion_data_annotator'); // Adjust the path as needed

async function testUrlToMarkdown() {
    const testUrls = [
        "https://www.biorxiv.org/content/10.1101/2024.09.23.614650v1",
        // "https://arxiv.org/abs/2407.14794",

    ];

    for (const url of testUrls) {
        console.log(`Testing URL: ${url}`);
        try {
            const markdown = await urlToMarkdown(url);
            console.log('First 500 characters of converted Markdown:');
            console.log(markdown);
            console.log('\n---\n');
        } catch (error) {
            console.error(`Error testing ${url}: ${error.message}`);
        }
    }
}

testUrlToMarkdown();