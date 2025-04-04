# Readable Browser Extension

A browser extension that extracts article content from web pages and displays it in a clean, readable format using the Shadow DOM.

## Features

- Extracts content using Mozilla's Readability library
- Renders content in a clean, distraction-free view
- Uses TailwindCSS for typography and styling
- Isolates styles using Shadow DOM to avoid conflicts

## Technologies Used

- Vite
- React
- TypeScript  
- TailwindCSS (with Typography plugin)
- Mozilla Readability

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build the extension
npm run build:ext
```

## Installation

1. Build the extension using `npm run build:ext`
2. Load the extension in your browser:
   - **Chrome**: Go to `chrome://extensions/`, enable Developer mode, and click "Load unpacked". Select the `dist` folder.
   - **Firefox**: Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on", and select any file in the `dist` folder.

## Usage

1. Navigate to an article or blog post
2. Click the extension icon in your browser toolbar
3. The content will be extracted and displayed in a clean, readable format
4. Click the X button to close the readable view and return to the original page