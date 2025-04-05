# Readable

A browser extension that transforms cluttered web pages into clean, distraction-free reading experiences.

## Features

- **Content Extraction**: Uses Mozilla's Readability library to extract the main content from any web page
- **Clean Interface**: Presents articles in a beautiful, easy-to-read format
- **Dark Mode Support**: Automatically adapts to your browser's theme preference
- **Isolated Rendering**: Uses Shadow DOM to prevent style conflicts with the original page
- **One-Click Toggle**: Easily switch between the original page and readable view

## How It Works

Readable runs entirely in your browser. When activated:

1. It clones the current page
2. Extracts the meaningful content using Readability
3. Renders a clean version with React and Tailwind CSS
4. Isolates the new view using Shadow DOM technology

## Usage

1. Navigate to any article, blog post, or content-heavy page
2. Click the Readable extension icon in your browser toolbar
3. Enjoy the distraction-free reading experience
4. Click the × button (or the extension icon again) to return to the original page

## Technology Stack

- **Frontend**: React 19, TypeScript
- **Styling**: Tailwind CSS with Typography plugin
- **Content Extraction**: Mozilla Readability
- **Build System**: Vite, PostCSS
- **Extension Framework**: Chrome Extensions Manifest V3

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build the extension
npm run build:ext

# Run in Firefox for testing
npm run start
```

## Installation

1. Build the extension: `npm run build:ext`
2. Load in your browser:
   - **Chrome/Edge**: Go to `chrome://extensions/`, enable Developer mode, click "Load unpacked", select the `dist` folder
   - **Firefox**: Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select any file in the `dist` folder

## License

ISC
