require("dotenv").config();
const { Client, IntentsBitField } = require("discord.js");
const axios = require("axios"); // Use axios to make HTTP requests

// Initialize Discord client with necessary intents
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

// Handle message creation event
client.on("messageCreate", async (message) => {
  // Ignore bot messages, commands, and messages not in the specified channel
  if (message.author.bot) return;
  if (message.channel.id !== process.env.CHANNEL_ID) return;
  if (message.content.startsWith("!")) return;

  // Initialize conversation log with a system message
  let conversationLog = [
    { role: "system", content: "You are a friendly chatbot." },
  ];

  try {
    await message.channel.sendTyping(); // Simulate typing indicator

    // Fetch the last 15 messages and reverse them
    let prevMessages = await message.channel.messages.fetch({ limit: 15 });
    prevMessages.reverse();

    prevMessages.forEach((msg) => {
      if (msg.content.startsWith("!")) return; // Skip commands
      if (msg.author.id !== client.user.id && message.author.bot) return; // Skip other bots

      // Add assistant messages to the conversation log
      if (msg.author.id == client.user.id) {
        conversationLog.push({
          role: "assistant",
          content: msg.content,
          name: msg.author.username
            .replace(/\s+/g, "_")
            .replace(/[^\w\s]/gi, ""),
        });
      }

      // Add user messages to the conversation log
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

    // Make the request to Trussed AI API
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

    // Reply to the message with the AI response
    message.reply(response.data.choices[0].message.content);
  } catch (error) {
    console.log(`ERR: ${error}`);
  }
});

// Login to Discord with the bot token
client.login(process.env.TOKEN);
