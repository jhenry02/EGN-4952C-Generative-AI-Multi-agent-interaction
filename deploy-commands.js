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
    name: "createoutlineyoutube",
    description: "Create an outline from a YouTube video",
    options: [
      {
        type: 3, // STRING
        name: "url",
        description: "YouTube video URL",
        required: true,
      },
      {
        type: 3, // STRING
        name: "length",
        description: "Length of the class outline in minutes",
        required: false,
      },
      {
        type: 3, // STRING
        name: "name",
        description: "Name for the outline file",
        required: false,
      }
    ],
  },
  {
    name: "createpolls",
    description: "Create poll questions based on saved outlines",
    options: [
      {
        type: 3, // STRING
        name: "name",
        description: "Name for the generated polls",
        required: false,
      },
      {
        type: 4, // INTEGER
        name: "count",
        description: "Number of poll questions to generate (default: 5)",
        required: false,
      }
    ],
  },
  {
    name: "pollresults",
    description: "Show results for the current poll",
    options: [
      {
        type: 4, // INTEGER
        name: "question",
        description: "Question number to show results for",
        required: false,
      }
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
    description: "Create a slide with the outline and uploaded materials",
    options: [
      {
        type: 3, // STRING
        name: "classname",
        description: "The name of the class (e.g., Intro to Python)",
        required: true,
      },
      {
        type: 3, // STRING
        name: "username",
        description: "The instructor's name (e.g., Professor Marte)",
        required: true,
      },
    ],
  },
  {
    name: "next",
    description: "Move to the next slide",
  },
  {
    name: "back",
    description: "Move to the previous slide",
  },
  {
    name: "saveslide", // New Command
    description: "Save the current slide to the database",
    options: [
      {
        type: 3, // STRING
        name: "folder",
        description: "The name of the folder to save slides in",
        required: true, // Make this true if folder specification is mandatory
      },
      {
        type: 3, // STRING
        name: "title",
        description: "The title to assign to the slide",
        required: false,
      },
    ],
  },
  {
    name: "start",
    description: "Start presenting saved slides from the database",
    options: [
      {
        type: 3, // STRING
        name: "folder",
        description: "The name of the folder to present slides from",
        required: true,
      },
    ],
  },
  {
    name: "end",
    description: "End the presentation and clear the saved slides",
  },
  {
    name: "quiz",
    description: "Generate a multiple choice quiz based off the outline",
    options: [
      {
        type: 3,
        name: "length",
        description: "How many questions",
        required: true,
      }, 
      {
        type: 3,
        name: "name",
        description: "Name of the quiz",
        required: true,
      }
    ],
  },
  {
    name:"releasequiz",
    description: "Releases the questions of the quiz without the answers",
    options:[
      {
        type: 3,
        name: "name",
        description: "Which quiz do you want to release",
        required: true,
      }
    ]
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