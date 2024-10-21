// const axios = require("axios");
// const path = require("path");
// const fs = require("fs");
// require("dotenv").config(); // Load environment variables
// let outlineContent = ""; // Global variable to store the generated outline

// // Function to handle the Pre-M phase logic
// async function handlePreMPhase(message, client) {
//   // Check if the message is from the correct private channel
//   if (message.channel.id !== process.env.CHANNEL_ID_FOR_PRE_M) return;

//   // Ignore bot messages`
//   if (message.author.bot) return;

//   // Handle file uploads
//   if (message.attachments.size > 0) {
//     message.attachments.forEach(async (attachment) => {
//       const fileUrl = attachment.url;
//       const fileName = attachment.name;

//       const uploadDir = path.join(__dirname, "uploads");
//       if (!fs.existsSync(uploadDir)) {
//         fs.mkdirSync(uploadDir, { recursive: true });
//       }

//       const filePath = path.join(uploadDir, fileName);
//       const fileStream = fs.createWriteStream(filePath);

//       try {
//         const response = await axios.get(fileUrl, { responseType: "stream" });
//         response.data.pipe(fileStream);

//         fileStream.on("finish", () => {
//           message.reply(
//             `File "${fileName}" uploaded successfully and saved locally.`
//           );
//         });

//         fileStream.on("error", (err) => {
//           console.error(`Error downloading file: ${err.message}`);
//           message.reply(`Failed to upload "${fileName}".`);
//         });
//       } catch (error) {
//         console.error(`Error downloading file: ${error.message}`);
//         message.reply(`Failed to upload "${fileName}".`);
//       }
//     });
//     return;
//   }

//   // Handle commands
//   if (message.content.startsWith("/")) {
//     const args = message.content.slice(1).trim().split(/ +/);
//     const command = args.shift().toLowerCase();

//     if (command === "createoutline") {
//       const lectureLength = args[0] || "45"; // Default to 45 minutes if not specified
//       const outlineName = args[1] || "outline.txt"; // Default to 'outline.txt' if not specified
//       const uploadedMaterials = getUploadedMaterials();

//       if (uploadedMaterials.length === 0) {
//         message.reply(
//           "No materials uploaded. Please upload materials before creating an outline."
//         );
//         return;
//       }

//       try {
//         const response = await axios.post(
//           "https://fauengtrussed.fau.edu/provider/generic/chat/completions",
//           {
//             model: "gpt-4",
//             messages: [
//               {
//                 role: "system",
//                 content: `Create a ${lectureLength}-minute class outline using the following materials: ${uploadedMaterials.join(
//                   ", "
//                 )}.`,
//               },
//             ],
//           },
//           {
//             headers: {
//               Authorization: `Bearer ${process.env.API_KEY}`,
//             },
//           }
//         );

//         outlineContent = response.data.choices[0].message.content;
//         message.reply(`Here is the generated outline:\n${outlineContent}`);

//         // Save the outline to a file
//         const filePath = path.join(__dirname, "saved_outlines", outlineName);
//         if (!fs.existsSync(path.dirname(filePath))) {
//           fs.mkdirSync(path.dirname(filePath), { recursive: true });
//         }
//         fs.writeFileSync(filePath, outlineContent);
//         message.reply(`Outline saved as "${outlineName}".`);
//       } catch (error) {
//         console.error(`Error generating outline: ${error.message}`);
//         message.reply(
//           "Failed to create class outline. Please try again later."
//         );
//       }
//     }

//     if (command === "save") {
//       if (!outlineContent) {
//         message.reply(
//           "No outline available to save. Please create an outline first."
//         );
//         return;
//       }

//       const fileName = args.join(" ") || "outline.txt"; // Default filename if not specified
//       const filePath = path.join(__dirname, "saved_outlines", fileName);

//       try {
//         if (!fs.existsSync(path.dirname(filePath))) {
//           fs.mkdirSync(path.dirname(filePath), { recursive: true });
//         }

//         fs.writeFileSync(filePath, outlineContent);
//         message.reply(`Outline saved as "${fileName}".`);
//       } catch (error) {
//         console.error(`Error saving outline: ${error.message}`);
//         message.reply("Failed to save the outline. Please try again later.");
//       }
//     }
//   }
// }

// // Function to get uploaded materials
// function getUploadedMaterials() {
//   return fs
//     .readdirSync(path.join(__dirname, "uploads"))
//     .map((file) => path.basename(file));
// }

// module.exports = {
//   handlePreMPhase,
// };
