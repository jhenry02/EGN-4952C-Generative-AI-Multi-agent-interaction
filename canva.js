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

function createSlideImage(outlineContent, uploadedMaterials) {
  const width = 800;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background color
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Title text styling
  ctx.fillStyle = "#000000";
  ctx.font = "38px Times New Roman";
  ctx.fillText("Slide", 50, 50);

  // Content text styling
  ctx.font = "25px Times New Roman"; // Adjust font size for main content
  let yPosition = 100;
  const maxWidth = 700; // Maximum width for text before wrapping
  const lineHeight = 28; // Line height for spacing

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

  // Render each line of the outline content with wrapping
  outlineContent.split("\n").forEach((line) => {
    yPosition = wrapText(ctx, line, 50, yPosition, maxWidth, lineHeight);
  });

  return canvas;
}

// Save slide image to a file
function saveSlideImage(canvas, fileName) {
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(fileName, buffer);
  console.log(`Saved slide as ${fileName}`);
}

// Command to generate the current slide
async function createSlide(outlineContent, userId) {
  const sections = splitOutline(outlineContent);
  const currentSlideIndex = userSlides[userId] || 0;

  // Log the current slide index and the section being displayed
  console.log(`User ${userId} is on slide ${currentSlideIndex}`);
  console.log(`Displaying section: ${sections[currentSlideIndex]}`);

  const sectionContent = sections[currentSlideIndex];

  // Generate the slide image for the current section
  const slideCanvas = createSlideImage(sectionContent);
  const slideFilePath = path.join(__dirname, "slide_image.png"); // Define the file path
  saveSlideImage(slideCanvas, slideFilePath); // Save the image

  return slideFilePath; // Return the path to the saved file
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
