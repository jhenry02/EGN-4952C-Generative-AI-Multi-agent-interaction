require("dotenv").config();
const { Client, IntentsBitField, Events } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Initialize Discord client with necessary intents
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
});

// Handle message creation event
client.on("messageCreate", async (message) => {
  // Ignore bot messages
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

      fileStream.on("finish", () => {
        message.reply(
          `File "${fileName}" uploaded successfully and saved locally.`
        );
        // Here, add logic to store and organize the uploaded materials
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
      const lectureLength = args[0] || "45"; // Default to 45 minutes if not specified
      const uploadedMaterials = getUploadedMaterials(); // Function to fetch and organize uploaded materials

      if (uploadedMaterials.length === 0) {
        message.reply(
          "No materials uploaded. Please upload materials before creating an outline."
        );
        return;
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
                content: `Create a ${lectureLength}-minute class outline using the following materials: ${uploadedMaterials.join(
                  ", "
                )}.`,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.API_KEY}`,
            },
          }
        );

        // Split content if it exceeds 2000 characters
        const content = response.data.choices[0].message.content;
        splitAndSendMessage(message.channel, content, 2000);
      } catch (error) {
        console.log(`ERR: ${error}`);
        message.reply(
          "Failed to create class outline. Please try again later."
        );
      }
    }

    // Command to release materials
    if (command === "releasematerials") {
      const materialIds = args; // IDs or filenames of materials to be released

      if (materialIds.length === 0) {
        message.reply("Please specify the materials to release.");
        return;
      }

      // Implement logic to release materials to students
      message.reply(`Materials released: ${materialIds.join(", ")}`);
    }
  }

  // Handle normal messages (not commands)
  if (!message.content.startsWith("!")) {
    let conversationLog = [
      { role: "system", content: "You are a friendly chatbot." },
    ];

    try {
      await message.channel.sendTyping(); // Simulate typing indicator

      let prevMessages = await message.channel.messages.fetch({ limit: 15 });
      prevMessages.reverse();

      prevMessages.forEach((msg) => {
        if (msg.content.startsWith("!")) return; // Skip commands
        if (msg.author.id !== client.user.id && message.author.bot) return; // Skip other bots

        if (msg.author.id == client.user.id) {
          conversationLog.push({
            role: "assistant",
            content: msg.content,
            name: msg.author.username
              .replace(/\s+/g, "_")
              .replace(/[^\w\s]/gi, ""),
          });
        }

        if (msg.author.id == message.author.id) {
          conversationLog.push({
            role: "user",
            content: msg.content,
            name: message.author.username
              .replace(/\s+/g, "_")
              .replace(/[^\w\s]/gi, ""),
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

// Handle interactions (Slash Commands)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  try {
    // Acknowledge the interaction immediately
    await interaction.deferReply();

    if (commandName === "createoutline") {
      const lectureLength = options.getString("length") || "45";
      const uploadedMaterials = getUploadedMaterials();

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
              content: `Create a ${lectureLength}-minute class outline using the following materials: ${uploadedMaterials.join(
                ", "
              )}.`,
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
      await interaction.editReply(
        content.length > 2000
          ? "Response is too long to display in a single message."
          : content
      );
      if (content.length > 2000)
        splitAndSendMessage(interaction.channel, content, 2000);
    }

    if (commandName === "releasematerials") {
      const materialIds = options
        .getString("materials")
        .split(",")
        .map((id) => id.trim());

      if (materialIds.length === 0) {
        await interaction.editReply("Please specify the materials to release.");
        return;
      }

      await interaction.editReply(
        `Materials released: ${materialIds.join(", ")}`
      );
      // Implement logic to release materials
    }
  } catch (error) {
    console.error(`ERR: ${error}`);
    await interaction.editReply(
      "An error occurred while processing your request."
    );
  }
});

// Function to get uploaded materials
function getUploadedMaterials() {
  return fs
    .readdirSync(path.join(__dirname, "uploads"))
    .map((file) => path.basename(file));
}

// Function to split and send long messages
function splitAndSendMessage(channel, content, chunkSize) {
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    channel.send(chunk);
  }
}

// Login to Discord with the bot token
client.login(process.env.TOKEN);
