const { REST, Routes } = require("discord.js");
require("dotenv").config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.TOKEN;

console.log("Client ID:", clientId);
console.log("Guild ID:", guildId);
console.log("Token:", token);
if (!clientId || !guildId || !token) {
  console.error("Missing one or more required environment variables.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

const commands = [
  {
    name: "createoutline",
    description: "Create a class outline",
    options: [
      {
        type: 3, // STRING
        name: "length",
        description: "Length of the class outline in minutes",
        required: false,
      },
      {
        type: 3, // STRING
        name: "name",
        description: "Name of the file to save the outline as",
        required: false,
      },
    ],
  },
  {
    name: "releasematerials",
    description: "Release materials to students",
    options: [
      {
        type: 3, // STRING
        name: "materials",
        description: "IDs or filenames of materials to release",
        required: true,
      },
    ],
  },
  {
    name: "save",
    description: "Save the generated outline or lecture to your local machine",
    options: [
      {
        type: 3, // STRING
        name: "name",
        description: "The name of the file to save",
        required: true,
      },
    ],
  },
  {
    name: "createslide",
    description: "Create a slide with the outline and uploaded materials.",
  },
  {
    name: "creatematerials", // New command to generate materials
    description: "Generate materials based on uploaded content",
  },
];

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
