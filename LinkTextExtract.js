const cheerio = require('cheerio');
const axios = require('axios');

(async () => {
    const { data: html } = await axios.get('https://www.freecodecamp.org/news');
    const $ = cheerio.load(html);
    const text = $('body').text(); // Extracts all text from the <body>
    console.log(text.trim());
})();
