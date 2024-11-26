const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

// Dictionary to track user slide positions
const userSlides = {};

// Improved function to split outline into sections, accounting for various formats
function splitOutline(outlineContent) {
  // Split based on common outline section patterns (Roman numerals, capital letters, numbers)
  const sections = outlineContent.split(/\n(?=[A-Z0-9]{1,2}\.|[IVXLCDM]+\.)/);

  console.log("Raw sections before filtering:", sections); // Log raw sections

  // Filter out empty sections
  const filteredSections = sections.filter((section) => section.trim());
  console.log("Filtered sections:", filteredSections); // Log filtered sections

  return filteredSections;
}

function createSlideImage(content, isTitleSlide = false) {
  const width = 800;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background color
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (isTitleSlide) {
    // Title Slide Formatting
    ctx.fillStyle = "#000000";
    ctx.font = "bold 36px Times New Roman";
    ctx.fillText(content.title || "Title Not Provided", 50, 100);

    ctx.font = "24px Times New Roman";
    ctx.fillText(`Book Source: ${content.bookSource || "Unknown"}`, 50, 160);
    ctx.fillText(`Date: ${content.date || "N/A"}`, 50, 200);
    ctx.fillText(`Instructor: ${content.username || "N/A"}`, 50, 240);
    ctx.fillText(`Class: ${content.className || "N/A"}`, 50, 280);
  } else {
    // Content Slide Formatting
    ctx.fillStyle = "#000000";
    ctx.font = "28px Times New Roman";
    ctx.fillText("Slide Content", 50, 50);

    ctx.font = "20px Times New Roman";
    let yPosition = 100;
    const maxWidth = 700;
    const lineHeight = 30;

    content.split("\n").forEach((line) => {
      yPosition = wrapText(ctx, line, 50, yPosition, maxWidth, lineHeight);
    });
  }
  // Function to wrap text within a specified width
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let yPosition = y;

    words.forEach((word) => {
      const testLine = line + word + " ";
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && line) {
        ctx.fillText(line, x, yPosition);
        line = word + " ";
        yPosition += lineHeight;
      } else {
        line = testLine;
      }
    });
    ctx.fillText(line, x, yPosition);
    return yPosition + lineHeight;
  }

  return canvas;
}

// Save slide image to a file
function saveSlideImage(canvas, fileName) {
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(fileName, buffer);
  console.log(`Saved slide as ${fileName}`);
}

// Command to generate the current slide
async function createSlide(outlineContent, userId, metadata) {
  const sections = splitOutline(outlineContent);
  const currentSlideIndex = userSlides[userId] || 0;

  const slideFilePath = path.join(
    __dirname,
    `slide_${userId}_${currentSlideIndex}.png`
  );

  if (currentSlideIndex === 0) {
    // Create Title Slide
    const titleSlideContent = {
      title: metadata.title || "Default Title",
      bookSource: metadata.bookSource || "Unknown Source",
      date: metadata.date || new Date().toLocaleDateString(),
      username: metadata.username || "Instructor Not Provided", // Use the dynamically provided username
      className: metadata.className || "Class Name Not Provided", // Use the dynamically provided class name
    };

    console.log(`Creating title slide for user ${userId}`);
    const slideCanvas = createSlideImage(titleSlideContent, true);
    saveSlideImage(slideCanvas, slideFilePath);
  } else {
    // Create Content Slide
    const sectionContent = sections[currentSlideIndex];
    console.log(`User ${userId} is on slide ${currentSlideIndex}`);
    console.log(`Displaying section: ${sectionContent}`);

    const slideCanvas = createSlideImage(sectionContent, false);
    saveSlideImage(slideCanvas, slideFilePath);
  }

  return slideFilePath;
}

// Command for moving to the next slide
async function nextSlide(outlineContent, userId) {
  const sections = splitOutline(outlineContent);
  userSlides[userId] = Math.min(
    (userSlides[userId] || 0) + 1,
    sections.length - 1
  );
  return await createSlide(outlineContent, userId);
}

// Command for moving to the previous slide
async function previousSlide(outlineContent, userId) {
  userSlides[userId] = Math.max((userSlides[userId] || 1) - 1, 0);
  return await createSlide(outlineContent, userId);
}

// Exported functions to use in your Discord bot
module.exports = {
  createSlide,
  nextSlide,
  previousSlide,
};
