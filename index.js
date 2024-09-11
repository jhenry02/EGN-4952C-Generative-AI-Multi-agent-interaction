require("dotenv").config();
const { Client, IntentsBitField, Events } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes } = require('sequelize');

// Initialize Sequelize with SQLite (you can replace it with MySQL, PostgreSQL)
const sequelize = new Sequelize('sqlite::memory:');

// Define Models
const User = sequelize.define('User', {
  discordId: { type: DataTypes.STRING, primaryKey: true },
  role: { type: DataTypes.ENUM('professor', 'student'), allowNull: false },
  name: { type: DataTypes.STRING }
});

const Course = sequelize.define('Course', {
  courseName: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  createdBy: { type: DataTypes.STRING, allowNull: false }
});

const Lesson = sequelize.define('Lesson', {
  title: { type: DataTypes.STRING, allowNull: false },
  courseId: { type: DataTypes.INTEGER, allowNull: false }
});

const Material = sequelize.define('Material', {
  fileName: { type: DataTypes.STRING, allowNull: false },
  fileUrl: { type: DataTypes.STRING, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false }
});

const Quiz = sequelize.define('Quiz', {
  question: { type: DataTypes.STRING, allowNull: false },
  answer: { type: DataTypes.STRING, allowNull: false },
  lessonId: { type: DataTypes.INTEGER, allowNull: false }
});

// Define Relationships
Course.hasMany(Lesson);
Lesson.belongsTo(Course);
Lesson.hasMany(Material);
Lesson.hasMany(Quiz);

// Initialize Discord client
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions,
  ],
});

// Log when the bot is online
client.on("ready", () => {
  console.log("The bot is online!");
  
  // Sync Database
  sequelize.sync({ force: true }).then(() => {
    console.log("Database & tables created!");
  });
});

// Handle message creation event
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

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

      const response = await axios({
        method: "get",
        url: fileUrl,
        responseType: "stream",
      });

      response.data.pipe(fileStream);

      fileStream.on("finish", async () => {
        message.reply(`File "${fileName}" uploaded successfully and saved locally.`);

        // Here you would create a Material entry in the database
        const material = await Material.create({
          fileName: fileName,
          fileUrl: fileUrl,
          lessonId: 1 // For now, set lessonId to 1 (replace with actual logic)
        });
        console.log(`Material saved: ${material.fileName}`);
      });

      fileStream.on("error", (err) => {
        console.error(`Error downloading file: ${err.message}`);
        message.reply(`Failed to upload "${fileName}".`);
      });
    });
    return;
  }

  // Handle command messages
  if (message.content.startsWith("!")) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Command to create a class outline
    if (command === "createoutline") {
      const lectureLength = args[0] || "45"; 
      
      // Fetch materials related to lessons
      const materials = await Material.findAll({ where: { lessonId: 1 } });
      const materialNames = materials.map((material) => material.fileName).join(", ");

      if (!materialNames) {
        return message.reply("No materials uploaded.");
      }

      // Call AI to generate a class outline based on materials
      try {
        const response = await axios.post(
          "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: `Create a ${lectureLength}-minute class outline using the following materials: ${materialNames}.`,
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
        splitAndSendMessage(message.channel, content, 2000);
      } catch (error) {
        console.log(`ERR: ${error}`);
        message.reply("Failed to create class outline. Please try again later.");
      }
    }

    // Command to release materials
    if (command === "releasematerials") {
      const materialIds = args; 

      if (materialIds.length === 0) {
        message.reply("Please specify the materials to release.");
        return;
      }

      message.reply(`Materials released: ${materialIds.join(", ")}`);
    }
  }

  // Normal chat-based interaction with AI
  if (!message.content.startsWith("!")) {
    let conversationLog = [
      { role: "system", content: "You are a friendly chatbot." },
    ];

    try {
      await message.channel.sendTyping();

      let prevMessages = await message.channel.messages.fetch({ limit: 15 });
      prevMessages.reverse();

      prevMessages.forEach((msg) => {
        if (msg.content.startsWith("!")) return;
        if (msg.author.id !== client.user.id && message.author.bot) return;

        if (msg.author.id == client.user.id) {
          conversationLog.push({
            role: "assistant",
            content: msg.content,
          });
        }

        if (msg.author.id == message.author.id) {
          conversationLog.push({
            role: "user",
            content: msg.content,
          });
        }
      });

      const response = await axios.post(
        "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
        {
          model: "gpt-4",
          messages: conversationLog,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.API_KEY}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;
      splitAndSendMessage(message.channel, content, 2000);
    } catch (error) {
      console.log(`ERR: ${error}`);
    }
  }
});

// Utility function for splitting and sending long messages
function splitAndSendMessage(channel, content, chunkSize) {
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    channel.send(chunk);
  }
}

// Login to Discord
client.login(process.env.TOKEN);
