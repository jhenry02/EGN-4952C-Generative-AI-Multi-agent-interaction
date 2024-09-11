const { REST, Routes } = require("discord.js");
require("dotenv").config();

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.TOKEN;

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
