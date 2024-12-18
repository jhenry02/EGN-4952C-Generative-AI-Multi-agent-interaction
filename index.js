//Final code
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
const {
  createSlide,
  nextSlide,
  previousSlide,
  userSlides,
} = require("./canva.js");
const { YoutubeTranscript } = require("youtube-transcript");

const presentationState = {}; // { userId: { slides: [], currentSlide: 0 } }

// Constants for polls
const EMOJI_LETTERS = ["🇦", "🇧", "🇨", "🇩"];
const POLL_STORAGE = new Map(); // Store active polls

// Initialize SQLite database
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
  `CREATE TABLE IF NOT EXISTS homework (
id INTEGER PRIMARY KEY AUTOINCREMENT,
title TEXT NOT NULL,
description TEXT,
file_path TEXT,
due_date TEXT,
uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
uploaded_by TEXT
)`,
  (err) => {
    if (err) {
      console.error("Error creating homework table", err.message);
    } else {
      console.log("Homework table is ready.");
    }
  }
);
db.run(
  `CREATE TABLE IF NOT EXISTS saved_slides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    slidePath TEXT,
    title TEXT,
    savedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating saved_slides table " + err.message);
    } else {
      console.log("Saved slides table is ready.");
    }
  }
);

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
    fileName TEXT,
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
db.run(
  ` CREATE TABLE IF NOT EXISTS generated_quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    quiz TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating generated_quizzes table " + err.message);
    } else {
      console.log("Generated quizzes table is ready.");
    }
  }
);
db.run(
  `CREATE TABLE IF NOT EXISTS generated_homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    due_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating generated_homework table", err.message);
    } else {
      console.log("Generated homework table is ready.");
    }
  }
);
db.run(
  `CREATE TABLE IF NOT EXISTS generated_homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    due_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Error creating generated_homework table", err.message);
    } else {
      console.log("Generated homework table is ready.");
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
let lastGeneratedQuizId = null;

// Log when the bot is online
client.on("ready", () => {
  console.log("The bot is online!");
});

/// Keep this part to handle normal messages and file uploads
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const greetings = ["hello", "hi", "hey", "howdy", "greetings"];
  if (greetings.includes(message.content.toLowerCase())) {
    const username = message.author.username;
    await message.reply(`Hello ${username}, how can I help you?`);
    return;
  }

  try {
    await message.channel.sendTyping();

    const response = await axios.post(
      "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
      {
        model: "gpt-4",
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

    console.log("Full AI Response:", response.data);

    const content = response.data.choices[0]?.message?.content;
    if (content) {
      console.log("AI Response Content:", content);
      splitAndSendMessage(message.channel, content, 2000);
    } else {
      console.error("No content in AI response");
    }
  } catch (error) {
    console.error(`Error in message handling: ${error.message}`);
  }

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

          // Insert file info into database
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

              // Handle PDF files
              if (path.extname(fileName).toLowerCase() === ".pdf") {
                console.log("PDF detected");
                const pdfParser = new PDFParser(this, 1);

                pdfParser.on("pdfParser_dataError", (errData) => {
                  console.error(errData.parserError);
                });

                pdfParser.on("pdfParser_dataReady", (pdfData) => {
                  let rawText = pdfParser.getRawTextContent();

                  const maxCharLimit = 3000;
                  if (rawText.length > maxCharLimit) {
                    console.log(
                      `Text exceeds the maximum character limit of ${maxCharLimit}. Truncating...`
                    );
                    rawText = rawText.slice(0, maxCharLimit);
                  }
                  console.log(rawText);

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
        const title = options.getString("title") || "Untitled Outline";
        const bookSource = "Book Name"; // Replace with actual book retrieval logic if available
        const createdBy = interaction.user.username;
        const createdAt = new Date().toISOString();
        db.run(
          "INSERT INTO generated_outlines (name, outline, title, book_source, created_by, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
          ["Outline", content, title, bookSource, createdBy, createdAt],
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
    } else if (commandName === "createoutlineyoutube") {
      try {
        const youtubeUrl = options.getString("url");
        const lectureLength = options.getString("length") || "45";
        const outlineName = options.getString("name") || "youtube-outline";

        if (!youtubeUrl) {
          await interaction.editReply("Please provide a YouTube URL.");
          return;
        }

        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) {
          await interaction.editReply("Invalid YouTube URL.");
          return;
        }

        await interaction.editReply("Fetching video transcript...");

        const transcript = await getYoutubeTranscript(videoId);
        if (!transcript) {
          await interaction.editReply("Could not fetch video transcript.");
          return;
        }

        const response = await axios.post(
          "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "You are an expert at creating educational outlines.",
              },
              {
                role: "user",
                content: `Create a ${lectureLength}-minute lecture outline based on the following video transcript. Focus on the main topics and key points:\n\n${transcript}`,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.API_KEY}`,
            },
          }
        );

        const outlineContent = response.data.choices[0].message.content;

        db.run(
          "INSERT INTO generated_outlines (name, outline) VALUES (?, ?)",
          [outlineName, outlineContent],
          function (err) {
            if (err) {
              console.error("Error saving outline to database", err.message);
              interaction.editReply("Failed to save the generated outline.");
            } else {
              lastGeneratedOutlineId = this.lastID;
              splitAndSendMessage(interaction.channel, outlineContent, 2000);
              interaction.editReply(
                `Outline "${outlineName}" generated successfully!`
              );
            }
          }
        );
      } catch (error) {
        console.error(
          `Error in createoutlineyoutube command: ${error.message}`
        );
        await interaction.editReply(
          "An error occurred while creating the outline."
        );
      }
    } else if (commandName === "createpolls") {
      try {
        const pollCount = options.getInteger("count") || 5;
        const pollName = options.getString("name") || "lecture-polls";

        const savedOutlines = await getSavedOutlines();
        if (savedOutlines.length === 0) {
          await interaction.editReply("No saved outlines found.");
          return;
        }

        const outlineContent = savedOutlines[0].outline;

        await interaction.editReply("Generating poll questions...");

        const response = await axios.post(
          "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content:
                  "You are an expert at creating educational assessment questions.",
              },
              {
                role: "user",
                content: `Create ${pollCount} multiple choice questions. Each question should have 4 options (A-D). Format:
                Question 1: [Question]
                A) [Option]
                B) [Option]
                C) [Option]
                D) [Option]
                Correct: [A-D]
                
                Base the questions on this outline:\n\n${outlineContent}`,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.API_KEY}`,
            },
          }
        );

        const pollContent = response.data.choices[0].message.content;
        const questions = parseQuestions(pollContent);

        // Store polls in database
        db.run(
          "INSERT INTO generated_outlines (name, outline) VALUES (?, ?)",
          [pollName, pollContent],
          async function (err) {
            if (err) {
              console.error("Error saving polls to database", err.message);
              await interaction.editReply(
                "Failed to save the generated polls."
              );
              return;
            }

            lastGeneratedOutlineId = this.lastID;

            // Store questions for interactive display
            POLL_STORAGE.set(interaction.user.id, {
              questions,
              currentIndex: 0,
              votes: new Array(questions.length).fill().map(() => new Map()),
            });

            // Send first question
            await sendPollQuestion(
              interaction,
              questions[0],
              0,
              questions.length
            );
          }
        );
      } catch (error) {
        console.error(`Error in createpolls command: ${error.message}`);
        await interaction.editReply(
          "An error occurred while creating the polls."
        );
      }
    } else if (commandName === "pollresults") {
      try {
        const userData = POLL_STORAGE.get(interaction.user.id);
        if (!userData) {
          await interaction.followUp("No active polls found.");
          return;
        }

        const questionNum =
          options.getInteger("question") || userData.currentIndex + 1;
        const questionIndex = questionNum - 1;

        if (questionIndex < 0 || questionIndex >= userData.questions.length) {
          await interaction.followUp("Invalid question number.");
          return;
        }

        const question = userData.questions[questionIndex];
        const votes = userData.votes[questionIndex];

        const results = new Array(question.options.length).fill(0);
        votes.forEach((vote) => results[vote]++);

        const embed = new EmbedBuilder()
          .setTitle(`Poll Results: Question ${questionNum}`)
          .setDescription(question.text)
          .addFields({
            name: "Results",
            value: question.options
              .map(
                (opt, i) =>
                  `${EMOJI_LETTERS[i]} ${opt}: ${results[i]} votes (${
                    Math.round((results[i] / votes.size) * 100) || 0
                  }%)`
              )
              .join("\n"),
          })
          .setFooter({ text: `Correct Answer: ${question.correct}` })
          .setColor("#00FF00");

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error(`Error in pollresults command: ${error.message}`);
        await interaction.followUp(
          "An error occurred while showing poll results."
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
          `SELECT fileName FROM uploads ORDER BY uploadedAt DESC LIMIT 1`,
          [],
          (err, row) => {
            if (err) {
              console.error(
                "Error retrieving fileName from uploads table",
                err.message
              );
              interaction.editReply(
                "Failed to retrieve the file name for saving."
              );
              return;
            }

            if (!row || !row.fileName) {
              interaction.editReply(
                "No uploaded file found. Please upload a file first."
              );
              return;
            }

            const uploadedFileName = row.fileName;
            db.get(
              `SELECT outline FROM generated_outlines WHERE id = ?`,
              [lastGeneratedOutlineId],
              (err, row) => {
                if (err) {
                  console.error(
                    "Error retrieving generated outline",
                    err.message
                  );
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
                  "INSERT INTO saved_outlines (name, outline, fileName) VALUES (?, ?, ?)",
                  [fileName, row.outline, uploadedFileName],
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
        // Collect inputs for className and userName
        const className =
          interaction.options.getString("classname") ||
          "Class Name Not Provided"; // Dynamically fetch class name
        const inputUsername =
          interaction.options.getString("username") ||
          "Instructor Not Provided"; // Fetch username input by user
        const userId = interaction.user.id; // User ID of the person executing the command

        const savedOutlines = await getSavedOutlines();

        if (savedOutlines.length === 0) {
          await interaction.editReply("No saved outlines found.");
          return;
        }
        // Retrieve outline details
        const outline = savedOutlines[0];
        const outlineName = outline.name || "Untitled Outline";
        const fileName = outline.fileName || "File Name Not Available";
        const date = outline.savedAt || new Date().toISOString();

        // const outlineContent = savedOutlines[0].outline;
        // const uploadedMaterials = await getUploadedMaterials();

        // const slideFilePath = await createSlide(
        //   outlineContent,
        //   uploadedMaterials
        // );

        // Create a first slide with the given details
        const metadata = {
          title: savedOutlines[0].name,
          bookSource: savedOutlines[0].fileName,
          date: savedOutlines[0].savedAt,
          username: inputUsername,
          className,
        };

        const slidePath = await createSlide(
          savedOutlines[0].outline,
          interaction.user.id,
          metadata
        );

        if (!fs.existsSync(slidePath)) {
          throw new Error("Slide image was not created.");
        }
        // Send the slide to the user

        await interaction.followUp({
          content: "Here is your generated slide!",
          files: [{ attachment: slidePath, name: "slide.png" }],
        });
      } catch (error) {
        console.error("Error generating slide:", error);
        await interaction.followUp("Failed to generate slide.");
      }
    } else if (commandName === "next") {
      const userId = interaction.user.id;

      // Check if user is in an active presentation (after /start)
      if (presentationState[userId]) {
        const state = presentationState[userId];
        state.currentSlide = (state.currentSlide + 1) % state.slides.length; // Loop back to the start if at the end

        return interaction.followUp({
          content: "Here is your next slide:",
          files: [{ attachment: state.slides[state.currentSlide] }],
        });
      }

      // Fallback to pre-saving (during /createslide)
      const savedOutlines = await getSavedOutlines();
      if (savedOutlines.length === 0) {
        return interaction.followUp(
          "No saved outlines found. Generate slides first."
        );
      }

      const outlineContent = savedOutlines[0].outline;
      const slidePath = await nextSlide(outlineContent, userId);

      return interaction.followUp({
        content: "Here is your next slide:",
        files: [{ attachment: slidePath }],
      });
    } else if (commandName === "back") {
      const userId = interaction.user.id;

      // Check if presentation is active
      if (presentationState[userId]) {
        const state = presentationState[userId];
        state.currentSlide =
          (state.currentSlide - 1 + state.slides.length) % state.slides.length; // Loop to the end if at the beginning

        return interaction.followUp({
          content: "Here is your previous slide:",
          files: [{ attachment: state.slides[state.currentSlide] }],
        });
      }

      interaction.reply("You must start the presentation first using /start.");

      // Fallback to pre-saving (during /createslide)
      const savedOutlines = await getSavedOutlines();
      if (savedOutlines.length === 0) {
        return interaction.followUp(
          "No saved outlines found. Generate slides first."
        );
      }

      const outlineContent = savedOutlines[0].outline;
      const slidePath = await previousSlide(outlineContent, userId);

      return interaction.followUp({
        content: "Here is your previous slide:",
        files: [{ attachment: slidePath }],
      });
    } else if (commandName === "saveslide") {
      const userId = interaction.user.id;
      const folderName = options.getString("folder"); // Get folder name input

      if (!folderName) {
        return interaction.followUp({
          content:
            "Please provide a folder name using `/saveslide folder:<folder_name>`.",
          ephemeral: true,
        });
      }

      const slidesToSave = [];
      const currentSlideCount = userSlides[userId] || 0;

      for (let i = 0; i <= currentSlideCount; i++) {
        const slidePath = path.join(__dirname, `slide_${userId}_${i}.png`);
        if (fs.existsSync(slidePath)) {
          slidesToSave.push(slidePath);
        }
      }

      if (slidesToSave.length === 0) {
        return interaction.followUp({
          content: "No slides found to save. Please generate slides first.",
          ephemeral: true,
        });
      }

      slidesToSave.forEach((slidePath, index) => {
        db.run(
          `INSERT INTO saved_slides (userId, slidePath, title, folderName) VALUES (?, ?, ?, ?)`,
          [userId, slidePath, `Slide ${index + 1}`, folderName],
          (err) => {
            if (err) {
              console.error("Error saving slide to database", err.message);
            }
          }
        );
      });

      interaction.followUp({
        content: `Slides saved successfully in folder: ${folderName}.`,
        ephemeral: true,
      });
    } else if (commandName === "start") {
      const userId = interaction.user.id;
      const folderName = options.getString("folder"); // Get folder name input

      if (!folderName) {
        return interaction.followUp({
          content:
            "Please provide a folder name using `/start folder:<folder_name>`.",
          ephemeral: true,
        });
      }

      db.all(
        `SELECT * FROM saved_slides WHERE userId = ? AND folderName = ?  ORDER BY title ASC`,
        [userId, folderName],
        (err, rows) => {
          if (err) {
            console.error("Error fetching saved slides:", err.message);
            return;
          }
          const slides = rows.map((row) => row.slidePath);
          console.log("Slides retrieved in order:", slides);

          presentationState[userId] = {
            slides: slides,
            currentSlide: 0, // Start from the first slide
          };

          interaction.followUp({
            content: `Presentation started. Here is the first slide from folder: ${folderName}.`,
            files: [{ attachment: slides[0] }],
          });
        }
      );
    } else if (commandName === "end") {
      const userId = interaction.user.id;

      if (!presentationState[userId]) {
        interaction.editReply("You are not currently presenting.");
        return;
      }

      delete presentationState[userId];
      interaction.editReply("Presentation ended. Thank you!");
    } else if (commandName === "homework") {
      const action = options.getString("action");

      if (action === "upload") {
        const title = options.getString("title");
        const dueDate = options.getString("due_date");
        const description = options.getString("description");

        if (!title) {
          await interaction.editReply(
            "Please provide a title for the homework assignment."
          );
          return;
        }

        const uploadDir = path.join(__dirname, "homework_uploads");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        await interaction.editReply(
          "Please upload the homework file in your next message."
        );

        const filter = (m) =>
          m.author.id === interaction.user.id && m.attachments.size > 0;
        const collector = interaction.channel.createMessageCollector({
          filter,
          time: 30000,
          max: 1,
        });

        collector.on("collect", async (message) => {
          const attachment = message.attachments.first();
          const fileName = `${Date.now()}-${attachment.name}`;
          const filePath = path.join(uploadDir, fileName);

          try {
            const response = await axios({
              method: "get",
              url: attachment.url,
              responseType: "stream",
            });

            const fileStream = fs.createWriteStream(filePath);
            response.data.pipe(fileStream);

            fileStream.on("finish", () => {
              db.run(
                `INSERT INTO homework (title, description, file_path, due_date, uploaded_by) 
                 VALUES (?, ?, ?, ?, ?)`,
                [title, description, filePath, dueDate, interaction.user.id],
                function (err) {
                  if (err) {
                    console.error(
                      "Error saving homework to database",
                      err.message
                    );
                    interaction.followUp("Failed to save homework assignment.");
                    return;
                  }

                  const embed = {
                    title: "Homework Assignment Uploaded",
                    fields: [
                      { name: "Title", value: title },
                      { name: "Due Date", value: dueDate || "Not specified" },
                      {
                        name: "Description",
                        value: description || "No description provided",
                      },
                    ],
                    color: 0x00ff00,
                    timestamp: new Date(),
                  };

                  interaction.followUp({ embeds: [embed] });
                }
              );
            });

            fileStream.on("error", (err) => {
              console.error("Error saving file:", err);
              interaction.followUp("Failed to save the homework file.");
            });
          } catch (error) {
            console.error("Error downloading file:", error);
            interaction.followUp("Failed to process the homework file.");
          }
        });

        collector.on("end", (collected) => {
          if (collected.size === 0) {
            interaction.followUp(
              "No file was uploaded in time. Please try again."
            );
          }
        });
      } else if (action === "list") {
        db.all(
          `SELECT * FROM homework ORDER BY uploaded_at DESC`,
          [],
          async (err, rows) => {
            if (err) {
              console.error("Error fetching homework assignments", err.message);
              await interaction.editReply(
                "Failed to fetch homework assignments."
              );
              return;
            }

            if (rows.length === 0) {
              await interaction.editReply("No homework assignments found.");
              return;
            }

            const embed = {
              title: "Homework Assignments",
              fields: rows.map((row) => ({
                name: row.title,
                value: `Due: ${row.due_date || "Not specified"}\n${
                  row.description || "No description"
                }`,
              })),
              color: 0x0099ff,
              timestamp: new Date(),
            };

            await interaction.editReply({ embeds: [embed] });
          }
        );
      }
    } else if (commandName === "quiz") {
      const uploadedMaterials = await getUploadedMaterials();
      const questionNumber = options.getString("length") || 10; //Default will be 10
      const savedOutlines = await getSavedOutlines();
      console.log("Uploaded Materials:", uploadedMaterials);

      if (savedOutlines.length === 0) {
        await interaction.editReply("No saved outlines found.");
        return;
      }

      const outlineContent = savedOutlines[0].outline;
      if (uploadedMaterials.length === 0) {
        await interaction.editReply(
          "Cannot generate quiz without uploaded materials"
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
              content: `Generate a ${questionNumber}-question multiple choice quiz based on the content in ${outlineContent}, include the correct answers`,
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
      const name = options.getString("name");
      db.run(
        "INSERT INTO generated_quizzes (name, quiz) VALUES (?, ?)",
        [name, content],
        function (err) {
          if (err) {
            console.error("Error saving quiz", err.message);
            interaction.editReply("Failed to save the generated quiz.");
          } else {
            lastGeneratedQuizId = this.lastID; // Store the last generated quiz ID
            splitAndSendMessage(interaction.channel, content, 2000);
            interaction.editReply("Quiz generated and saved.");
          }
        }
      );
    } else if (commandName === "releasequiz") {
      const quizName = options.getString("name"); // Get the quiz name from the command options
      try {
        // Retrieve the quiz from the database
        const savedQuiz = await getSavedQuizzes(quizName);

        if (!savedQuiz) {
          await interaction.editReply(
            `No quiz found with the name "${quizName}".`
          );
          return;
        }

        const quizContent = savedQuiz.quiz; // Extract the quiz content

        //Remove answers
        const response = await axios.post(
          "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `Return the following quiz with the correct answers hidden:\n\n${quizContent}`,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.API_KEY}`,
            },
          }
        );
        const modifiedQuiz = response.data.choices[0]?.message?.content;
        await interaction.editReply(modifiedQuiz);
      } catch (error) {
        console.error("Error releasing quiz:", error.message);
        await interaction.editReply("Unable to release quiz.");
      }
    }
    // Inside your client.on(Events.InteractionCreate) event handler,
    // alongside your existing command handlers (createoutline, quiz, etc.)
    // Add these cases to handle homework commands:
    else if (commandName === "releasehomework") {
      try {
        const name = options.getString("name");

        // Get homework from database
        db.get(
          "SELECT * FROM generated_homework WHERE name = ?",
          [name],
          async (err, homework) => {
            if (err) {
              console.error("Error fetching homework:", err);
              await interaction.editReply(
                "Failed to fetch homework assignment."
              );
              return;
            }

            if (!homework) {
              await interaction.editReply(
                `No homework found with the name "${name}".`
              );
              return;
            }

            // Remove solutions using AI
            const response = await axios.post(
              "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
              {
                model: "gpt-4",
                messages: [
                  {
                    role: "system",
                    content: `Remove all solutions and answers from this homework assignment, keeping only the questions and any necessary context or instructions:\n\n${homework.content}`,
                  },
                ],
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.API_KEY}`,
                },
              }
            );

            const studentVersion = response.data.choices[0].message.content;

            // Create embed for homework
            const embed = {
              title: `Homework Assignment: ${name}`,
              description:
                "Please complete all questions and submit by the due date.",
              fields: [
                {
                  name: "Due Date",
                  value: homework.due_date,
                  inline: true,
                },
              ],
              color: 0x0099ff,
              timestamp: new Date(),
            };

            // Send to channel
            await interaction.editReply({ embeds: [embed] });
            await splitAndSendMessage(
              interaction.channel,
              studentVersion,
              2000
            );
          }
        );
      } catch (error) {
        console.error("Error releasing homework:", error);
        await interaction.editReply(
          "Failed to release homework. Please try again."
        );
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
  const chunkSize = 2000;
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
function getSavedQuizzes(name) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT quiz FROM generated_quizzes WHERE name = ?",
      [name],
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      }
    );
  });
}

function extractVideoId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com")) {
      return urlObj.searchParams.get("v");
    } else if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1);
    }
  } catch (error) {
    return null;
  }
  return null;
}

async function getYoutubeTranscript(videoId) {
  try {
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    return transcriptArray
      .map((item) => item.text)
      .join(" ")
      .trim();
  } catch (error) {
    throw new Error(
      "Failed to fetch video transcript. Make sure the video has closed captions available."
    );
  }
}

// Start the bot
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
