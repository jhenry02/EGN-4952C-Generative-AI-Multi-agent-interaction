require("dotenv").config();
const { Client, IntentsBitField } = require("discord.js");
const OpenAI = require("openai");

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

// Initialize OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.API_KEY,
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

    // Generate response from OpenAI
    const result = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversationLog,
    });

    // Reply to the message with the AI response
    message.reply(result.choices[0].message.content);
  } catch (error) {
    console.log(`ERR: ${error}`);
  }
});

// Login to Discord with the bot token
client.login(process.env.TOKEN);
