require("dotenv").config();
const {
    Client,
    IntentsBitField,
    Events,
    GatewayIntentBits,
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const PDFParser = require("pdf2json");
const cheerio = require("cheerio");
const readline = require("readline");

// Initialize SQLite database
const db = new sqlite3.Database("./uploads.db", (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
    } else {
        console.log("Connected to the SQLite database.");
    }
});

// Create necessary tables if not already present
db.run(
    `CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT,
    filePath TEXT,
    extractedText TEXT,
    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
);

// Initialize Discord client
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],
});

// Log when the bot is online
client.on("ready", () => {
    console.log("The bot is online!");
});

// Function to extract text from a webpage
async function extractTextFromWebpage(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Clean and extract content
        $('script, style, nav, header, footer, iframe, noscript').remove();
        const content = $('body')
            .text()
            .replace(/\s+/g, " ")
            .trim();
        return content;
    } catch (error) {
        console.error("Error extracting content:", error.message);
        return null;
    }
}

// Simple text summarization function
function summarizeText(text) {
    const sentences = text.split('. ');
    const summary = sentences.join('. ');
    return summary;
}

// Prompt user to extract text from a webpage and open links
async function interactiveWebPageExtractor() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question("Please enter a URL: ", async (url) => {
        if (!url) {
            console.error("No URL provided. Exiting.");
            rl.close();
            return;
        }

        try {
            const { data: html } = await axios.get(url);
            const $ = cheerio.load(html);
            const links = [];

            $('a').each((index, element) => {
                const text = $(element).text().trim();
                const href = $(element).attr('href');
                if (href) {
                    const absoluteHref = new URL(href, url).href;
                    links.push({ text, url: absoluteHref });
                }
            });

            if (links.length === 0) {
                console.log("No links found.");
            } else {
                console.log("\nLinks found:");
                links.forEach((link, index) => {
                    console.log(`${index + 1}: ${link.text} (${link.url})`);
                });

                rl.question("\nEnter the number of a link to open: ", async (choice) => {
                    const linkIndex = parseInt(choice, 10) - 1;
                    if (isNaN(linkIndex) || linkIndex < 0 || linkIndex >= links.length) {
                        console.error("Invalid choice. Exiting.");
                    } else {
                        const chosenLink = links[linkIndex];
                        console.log(`Opening: ${chosenLink.url}`);
                        await open(chosenLink.url);

                        rl.question("\nEnter the number of a link to summarize: ", async (summaryChoice) => {
                            const summaryLinkIndex = parseInt(summaryChoice, 10) - 1;
                            if (isNaN(summaryLinkIndex) || summaryLinkIndex < 0 || summaryLinkIndex >= links.length) {
                                console.error("Invalid choice. Exiting.");
                            } else {
                                const summaryLink = links[summaryLinkIndex];
                                const content = await extractTextFromWebpage(summaryLink.url);
                                if (content) {
                                    console.log("Extracted Text:");
                                    console.log(content);
                                    const summary = summarizeText(content);
                                    console.log("Summary:");
                                    console.log(summary);
                                }
                            }
                            rl.close();
                        });
                    }
                });
            }
        } catch (error) {
            console.error("Error processing URL:", error.message);
            rl.close();
        }
    });
}

// Function to extract text from a webpage and print it
async function extractAndPrintTextFromWebpage(url) {
    if (!url) {
        console.error("No URL provided. Exiting.");
        return;
    }

    try {
        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);
        const text = $('body').text(); // Extracts all text from the <body>
        console.log("Extracted Text:");
        console.log(text.trim());

        const summary = summarizeText(text.trim());
        console.log("Summary:");
        console.log(summary);
    } catch (error) {
        console.error(`Failed to fetch or process the URL: ${error.message}`);
    }
}

// Discord bot functionality
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.content.match(urlRegex);

    if (urls) {
        for (const url of urls) {
            const content = await extractTextFromWebpage(url);
            if (content) {
                console.log(`Content extracted from ${url}:`);
                console.log(content);

                const summary = summarizeText(content);
                console.log("Summary:");
                console.log(summary);
            }
        }
    }
});

let open;
(async () => {
    open = (await import("open")).default;
    // Run interactive webpage extractor
    interactiveWebPageExtractor();
})();

// Login to Discord
client.login(process.env.TOKEN);
