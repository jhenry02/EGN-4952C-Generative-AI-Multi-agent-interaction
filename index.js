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
const { createSlide, nextSlide, previousSlide } = require("./canva.js");

// Insert file info into the SQLite database
const db = new sqlite3.Database("./uploads.db", (err) => {
  if (err) {
    console.error("Error opening database " + err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

// Create tables if they don't exist
db.run(
  `CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT,
    filePath TEXT,
    extractedText TEXT,
    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating uploads table " + err.message);
    } else {
      console.log("Uploads table is ready.");
    }
  }
);

db.run(
  `CREATE TABLE IF NOT EXISTS generated_outlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    outline TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating generated_outlines table " + err.message);
    } else {
      console.log("Generated outlines table is ready.");
    }
  }
);

db.run(
  `CREATE TABLE IF NOT EXISTS saved_outlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    outline TEXT,
    savedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating saved_outlines table " + err.message);
    } else {
      console.log("Saved outlines table is ready.");
    }
  }
);

// Initialize Discord client with necessary intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions,

    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let lastGeneratedOutlineId = null; // Store the ID of the last generated outline

// Log when the bot is online
client.on("ready", () => {
  console.log("The bot is online!");
});

/// Keep this part to handle normal messages and file uploads
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  try {
    // Send typing indicator
    await message.channel.sendTyping();

    // Simple AI conversation logic for normal messages
    const response = await axios.post(
      "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
      {
        model: "gpt-4", // Or whichever model you are using
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: message.content },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
    // Check for next, back, and loadoutline commands

    // Log the entire response
    console.log("Full AI Response:", response.data);

    const content = response.data.choices[0]?.message?.content;
    if (content) {
      console.log("AI Response Content:", content);
      splitAndSendMessage(message.channel, content, 2000);
    } else {
      console.error("No content in AI response");
    }
    // Send the AI's response back to the user
    splitAndSendMessage(message.channel, content, 2000);
  } catch (error) {
    console.error(`Error in message handling: ${error.message}`);
  }

  // Handle file uploads
  // Handle file uploads
  if (message.attachments.size > 0) {
    message.attachments.forEach(async (attachment) => {
      const fileUrl = attachment.url;
      const fileName = attachment.name;

      const uploadDir = path.join(__dirname, "uploads");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      const fileStream = fs.createWriteStream(filePath);

      try {
        const response = await axios({
          method: "get",
          url: fileUrl,
          responseType: "stream",
        });

        response.data.pipe(fileStream);

        fileStream.on("finish", () => {
          message.reply(
            `File "${fileName}" uploaded successfully and saved to "${filePath}".`
          );

          // Insert file info into the SQLite database
          db.run(
            `INSERT INTO uploads (fileName, filePath) VALUES (?, ?)`,
            [fileName, filePath],
            function (err) {
              if (err) {
                return console.error(
                  "Error inserting into database",
                  err.message
                );
              }
              console.log(
                `File "${fileName}" stored at "${filePath}" with ID ${this.lastID}`
              );

              // Text extraction logic
              let rawText = null;
              if (path.extname(fileName).toLowerCase() === ".pdf") {
                console.log("PDF detected");

                const pdfParser = new PDFParser(this, 1);

                pdfParser.on("pdfParser_dataError", (errData) => {
                  console.error(errData.parserError);
                });

                pdfParser.on("pdfParser_dataReady", (pdfData) => {
                  rawText = pdfParser.getRawTextContent();

                  // Truncate the text if it exceeds the maximum character limit
                  const maxCharLimit = 3000;
                  if (rawText.length > maxCharLimit) {
                    console.log(
                      `Text exceeds the maximum character limit of ${maxCharLimit}. Truncating...`
                    );
                    rawText = rawText.slice(0, maxCharLimit); // Truncate text to maxCharLimit characters
                  }
                  console.log(rawText);

                  // Add the rawText to the extractedText field of the most recent entry in the database
                  db.run(
                    `UPDATE uploads SET extractedText = ? WHERE id = ?`,
                    [rawText, this.lastID],
                    function (err) {
                      if (err) {
                        return console.error(
                          "Error updating extracted text in database",
                          err.message
                        );
                      }
                      console.log(
                        `Updated extractedText for entry with ID ${this.lastID}`
                      );
                    }
                  );
                });

                pdfParser.loadPDF(filePath);
              }
            }
          );
        });

        fileStream.on("error", (err) => {
          console.error(`Error downloading file: ${err.message}`);
          message.reply(`Failed to upload "${fileName}".`);
        });
      } catch (error) {
        console.error(`Error downloading file: ${error.message}`);
        message.reply(`Failed to upload "${fileName}".`);
      }
    });
    return;
  }
});

// Now, let's handle slash commands in the interactionCreate event
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  try {
    await interaction.deferReply(); // Acknowledge interaction

    if (commandName === "createoutline") {
      try {
        const lectureLength = options.getString("length") || "45";
        const uploadedMaterials = await getUploadedMaterials();

        if (uploadedMaterials.length === 0) {
          await interaction.editReply(
            "No materials uploaded. Please upload materials before creating an outline."
          );
          return;
        }

        const response = await axios.post(
          "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `Create a highly detailed, lecture-ready outline for a ${lectureLength}-minute class on the topic "${uploadedMaterials.join(
                  ", "
                )}". For each main section, include the following:
                        1. A clear and concise definition or explanation of the concept.
                        2. Real-world applications or examples that illustrate the concept.
                        3. Detailed steps or methodologies if applicable.
                        4. Key subtopics or subheadings under each main section.
                        5. Important takeaways or key points to remember.
                        Do not describe an outline, directly state the concepts, not a description of which concepts to use. The response should avoid vagueness and provide sufficient depth for each concept so that it is fully explained. Each main section should contain at least 5 sentences with additional examples and details to enhance comprehension.`,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.API_KEY}`,
            },
          }
        );

        const content = response.data.choices[0].message.content;

        db.run(
          "INSERT INTO generated_outlines (name, outline) VALUES (?, ?)",
          ["Outline", content],
          function (err) {
            if (err) {
              console.error("Error saving outline to database", err.message);
              interaction.editReply("Failed to save the generated outline.");
            } else {
              lastGeneratedOutlineId = this.lastID;
              splitAndSendMessage(interaction.channel, content, 2000);
              interaction.editReply("Outline generated and saved.");
            }
          }
        );
      } catch (error) {
        console.error(`Error in createoutline command: ${error.message}`);
        await interaction.editReply(
          "An error occurred while creating the outline."
        );
      }
    } else if (commandName === "save") {
      try {
        const fileName = options.getString("name");

        if (!lastGeneratedOutlineId) {
          await interaction.editReply(
            "No outline available to save. Please create an outline first."
          );
          return;
        }

        db.get(
          `SELECT outline FROM generated_outlines WHERE id = ?`,
          [lastGeneratedOutlineId],
          (err, row) => {
            if (err) {
              console.error("Error retrieving generated outline", err.message);
              interaction.editReply(
                "Failed to retrieve the generated outline."
              );
              return;
            }

            if (!row) {
              interaction.editReply(
                "No generated outline found to save. Please generate an outline first."
              );
              return;
            }

            db.run(
              "INSERT INTO saved_outlines (name, outline) VALUES (?, ?)",
              [fileName, row.outline],
              function (err) {
                if (err) {
                  console.error(
                    "Error saving outline to database",
                    err.message
                  );
                  interaction.editReply(
                    "Failed to save the outline. Please try again."
                  );
                } else {
                  db.run(
                    `DELETE FROM generated_outlines WHERE id = ?`,
                    [lastGeneratedOutlineId],
                    (err) => {
                      if (err) {
                        console.error(
                          "Error deleting old generated outline",
                          err.message
                        );
                      }
                    }
                  );
                  interaction.editReply(
                    `Outline saved successfully with the name "${fileName}".`
                  );
                }
              }
            );
          }
        );
      } catch (error) {
        console.error(`Error in save command: ${error.message}`);
        await interaction.editReply(
          "An error occurred while saving the outline."
        );
      }
    } else if (commandName === "createslide") {
      try {
        const savedOutlines = await getSavedOutlines();

        if (savedOutlines.length === 0) {
          await interaction.editReply("No saved outlines found.");
          return;
        }

        const outlineContent = savedOutlines[0].outline;
        const uploadedMaterials = await getUploadedMaterials();

        const slideFilePath = await createSlide(
          outlineContent,
          uploadedMaterials
        );

        if (!fs.existsSync(slideFilePath)) {
          throw new Error("Slide image was not created.");
        }

        await interaction.followUp({
          content: "Here is your generated slide!",
          files: [{ attachment: slideFilePath, name: "slide_image.png" }],
        });
      } catch (error) {
        console.error("Error generating slide:", error);
        await interaction.followUp("Failed to generate slide.");
      }
    } else if (commandName === "next") {
      try {
        const savedOutlines = await getSavedOutlines();
        if (savedOutlines.length === 0) {
          await interaction.editReply("No saved outlines found.");
          return;
        }

        const outlineContent = savedOutlines[0].outline;
        const imagePath = await nextSlide(outlineContent, interaction.user.id);

        // Use followUp for the second message to avoid InteractionAlreadyReplied error
        await interaction.followUp({ files: [{ attachment: imagePath }] });
      } catch (error) {
        console.error("Error going to next slide:", error);
        await interaction.editReply("Failed to go to the next slide.");
      }
    } else if (commandName === "back") {
      try {
        const savedOutlines = await getSavedOutlines();
        if (savedOutlines.length === 0) {
          await interaction.editReply("No saved outlines found.");
          return;
        }

        const outlineContent = savedOutlines[0].outline;
        const imagePath = await previousSlide(
          outlineContent,
          interaction.user.id
        );

        // Use followUp for the second message to avoid InteractionAlreadyReplied error
        await interaction.followUp({ files: [{ attachment: imagePath }] });
      } catch (error) {
        console.error("Error going to previous slide:", error);
        await interaction.editReply("Failed to go to the previous slide.");
      }
    }
  } catch (error) {
    console.error(`Error handling interaction: ${error.message}`);
    await interaction.editReply(
      "An error occurred while processing your request."
    );
  }
});

// Function to split and send long messages
// Function to split and send long messages
async function splitAndSendMessage(channel, content, delay) {
  const chunkSize = 5000;
  const numChunks = Math.ceil(content.length / chunkSize);
  let start = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunk = content.substring(start, start + chunkSize);
    await channel.send(chunk); // Await the send operation
    start += chunkSize;
    if (i < numChunks - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay)); // Await the delay
    }
  }
}

// Function to retrieve saved outlines
function getSavedOutlines() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM saved_outlines ORDER BY createdAt DESC LIMIT 1",
      [],
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}
// Function to get uploaded materials from the SQLite database
function getUploadedMaterials() {
  return new Promise((resolve, reject) => {
    db.all("SELECT extractedText FROM uploads", [], (err, rows) => {
      if (err) {
        console.error("Error retrieving uploaded materials:", err.message);
        return reject(err);
      }
      const materials = rows.map((row) => row.extractedText).filter(Boolean);
      resolve(materials);
    });
  });
}

async function generateContentFromMaterials(
  uploadedMaterials,
  sectionHeader,
  lectureLength
) {
  const contentArray = uploadedMaterials; // Already contains extracted text

  // Debug: Check combined content from materials
  console.log("Combined Material Content:", contentArray);

  // Handle content length to avoid API errors
  const MAX_CONTENT_LENGTH = 4000;
  let sectionContent = contentArray.join("\n");

  if (sectionContent.length > MAX_CONTENT_LENGTH) {
    sectionContent = sectionContent.substring(0, MAX_CONTENT_LENGTH); // Truncate if too long
  }

  // Debug: Check the combined section content
  console.log("Combined Section Content:", sectionContent);

  // Initialize an array to hold generated content for each section
  const generatedContents = [];
  // const contentSections = [];

  for (const contentSection of contentSections) {
    try {
      const payload = {
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `Create a detailed ${lectureLength}-minute ${generatedContent} section for the lecture on "${sectionHeader}". Use the materials provided. Include definitions, examples, and detailed explanations relevant to this section. Please give out information.`,
          },
          {
            role: "user",
            content: sectionContent, // Combined content from materials
          },
        ],
      };

      console.log("Payload being sent:", JSON.stringify(payload));

      // Make the API call
      const response = await axios.post(
        "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
        payload,
        {
          headers: {
            Authorization: `Bearer ${process.env.API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      // Extract and store content from the API response
      const generatedContent = response.data.choices[0].message.content;
      generatedContents.push(generatedContent);
      console.log("AI Response Content:", generatedContent);
    } catch (error) {
      console.error(
        `Error generating content for ${contentSection}: ${error.message}`
      );
      throw new Error(`Failed to generate content for ${contentSection}.`);
    }
  }

  // Return all generated content concatenated as a single string
  return generatedContents.join("\n");
}

function splitContent(content, maxLength) {
  const sections = [];
  let currentSection = "";

  const words = content.split(" "); // Split by spaces to maintain whole words

  for (const word of words) {
    if ((currentSection + word).length + 100 <= maxLength) {
      // Add a buffer of 100 characters
      currentSection += `${word} `;
    } else {
      sections.push(currentSection.trim());
      currentSection = `${word} `;
    }
  }
  if (currentSection) sections.push(currentSection.trim());

  return sections;
}
const extractTextFromFiles = async (filePaths) => {
  let allText = [];
  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
      const text = await extractTextFromPDF(filePath); // Implement PDF text extraction
      allText.push(text);
    } else {
      // Handle other file types (e.g., .txt, .docx, etc.)
      const text = fs.readFileSync(filePath, "utf8"); // Example for .txt files
      allText.push(text);
    }
  }
  return allText.join(" ");
};

// Login to Discord
client.login(process.env.TOKEN);
