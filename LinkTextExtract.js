const cheerio = require('cheerio');
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Please enter a URL: ", async (url) => {
    if (!url) {
        console.error("No URL provided. Exiting.");
        rl.close();
        process.exit(1);
    }

    try {
        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);
        const text = $('body').text(); // Extracts all text from the <body>
        console.log("Extracted Text:");
        console.log(text.trim());
    } catch (error) {
        console.error(`Failed to fetch or process the URL: ${error.message}`);
    } finally {
        rl.close();
    }
});
