(async () => {
    const open = (await import('open')).default; // For opening URLs in the default browser
    const cheerio = require('cheerio'); // For parsing and manipulating HTML
    const axios = require('axios'); // For making HTTP requests
    const readline = require('readline'); // For interactive user input

    // Create a readline interface for user input
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Prompt the user to enter a URL
    rl.question("Please enter a URL: ", async (url) => {
        // Check if a URL was provided
        if (!url) {
            console.error("No URL provided. Exiting.");
            rl.close();
            process.exit(1); // Exit with an error code
        }

        try {
            // Fetch the HTML of the provided URL
            const { data: html } = await axios.get(url);

            // Load the HTML into cheerio for parsing
            const $ = cheerio.load(html);

            // Array to store links and their associated text
            const links = [];

            // Find all <a> elements (hyperlinks) in the HTML
            $('a').each((index, element) => {
                const text = $(element).text().trim(); // Extract and trim the text inside the <a> tag
                const href = $(element).attr('href'); // Get the 'href' attribute (the link URL)

                if (href) {
                    // Resolve relative URLs to absolute URLs using the base URL
                    const absoluteHref = new URL(href, url).href;
                    links.push({ text, url: absoluteHref }); // Store the text and resolved URL
                }
            });

            // Check if any links were found
            if (links.length === 0) {
                console.log("No links found on the page.");
            } else {
                console.log("\nLinks found on the page:");
                // Display each link with its index number for user selection
                links.forEach((link, index) => {
                    console.log(`${index + 1}: ${link.text} (${link.url})`);
                });

                // Prompt the user to select a link by its number
                rl.question("\nEnter the number of the link you want to open: ", async (choice) => {
                    const linkIndex = parseInt(choice, 10) - 1; // Convert input to zero-based index

                    // Validate the user's choice
                    if (isNaN(linkIndex) || linkIndex < 0 || linkIndex >= links.length) {
                        console.error("Invalid choice. Exiting.");
                    } else {
                        // Get the chosen link and open it in the default browser
                        const chosenLink = links[linkIndex];
                        console.log(`Opening: ${chosenLink.url}`);
                        await open(chosenLink.url); // Opens the link in the browser
                    }
                    rl.close(); // Close the readline interface
                });
            }
        } catch (error) {
            // Handle errors that occur during fetching or processing
            console.error(`Failed to fetch or process the URL: ${error.message}`);
            rl.close();
        }
    });
})();
