const { createCanvas } = require("canvas");
const fs = require("fs");

function createSlideImage(outlineContent, uploadedMaterials) {
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Set background color
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Set text color and font
  ctx.fillStyle = "#000000";
  ctx.font = "24px Arial";

  // Add outline content to the slide
  ctx.fillText("Class Outline", 50, 50);
  const outlineLines = outlineContent.split("\n");
  let yPosition = 100;

  outlineLines.forEach((line) => {
    ctx.fillText(line, 50, yPosition);
    yPosition += 30;
  });

  // Add materials section
  ctx.fillText("Materials:", 50, yPosition + 20);
  let materialsY = yPosition + 50;
  uploadedMaterials.forEach((material) => {
    ctx.fillText(material, 50, materialsY);
    materialsY += 30;
  });

  return canvas;
}

function saveSlideImage(canvas, fileName) {
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(fileName, buffer); // Save the image as a PNG file
  console.log(`Saved slide as ${fileName}`);
}

// Your createSlide command
async function createSlide(outlineContent, uploadedMaterials) {
  try {
    // Call the function to create a slide image
    const slideCanvas = createSlideImage(outlineContent, uploadedMaterials);

    // Save the generated slide image
    const slideFileName = "slide_image.png"; // You can dynamically generate filenames if needed
    saveSlideImage(slideCanvas, slideFileName);
  } catch (error) {
    console.error("Error generating slide:", error);
  }
}

module.exports = { createSlideImage }; // Export the function
