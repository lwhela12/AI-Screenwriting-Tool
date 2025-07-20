import React from 'react';
import { ScreenplayProject } from '../components/ProjectManager';
import { pdf } from '@react-pdf/renderer';
import { ScreenplayDocument, ScreenplayData } from './screenplayPDF';
import { ScreenplayParser } from './screenplayParser';

// Convert screenplay text to HTML with proper formatting
function screenplayToHTML(project: ScreenplayProject): string {
  const { content, title, author, contact } = project;
  const lines = content.split('\n');
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 0; /* We'll handle margins in content */
    }
    
    @page :first {
      /* Title page - no page number */
    }
    
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .page-break {
        page-break-after: always;
      }
    }
    
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12pt;
      line-height: 1;
      background: white;
      margin: 0;
      padding: 0;
      width: 8.5in;
    }
    
    .title-page {
      page-break-after: always;
      height: 11in;
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 1in;
      box-sizing: border-box;
    }
    
    .title-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .contact-section {
      position: absolute;
      bottom: 1in;
      left: 1.5in;
      text-align: left;
      font-size: 12pt;
      line-height: 1.5;
    }
    
    .screenplay-content {
      padding: 1in 1in 1in 1.5in;
      min-height: 11in;
      box-sizing: border-box;
    }
    
    
    .title {
      text-transform: uppercase;
      font-size: 14pt;
      margin-bottom: 24pt;
    }
    
    .author {
      margin-top: 12pt;
    }
    
    .scene-heading {
      text-transform: uppercase;
      margin-top: 24pt;
      margin-bottom: 12pt;
    }
    
    .action {
      margin-top: 12pt;
      margin-bottom: 12pt;
      width: 100%;
    }
    
    .character {
      text-transform: uppercase;
      text-align: center;
      margin-top: 12pt;
      margin-bottom: 0;
      width: 100%;
    }
    
    .parenthetical {
      margin: 0 auto;
      width: 2.5in;
      padding-left: 0.3in;
      margin-top: 0;
      margin-bottom: 0;
    }
    
    .dialogue {
      margin: 0 auto;
      width: 3.5in;
      margin-top: 0;
      margin-bottom: 12pt;
    }
    
    .transition {
      text-transform: uppercase;
      text-align: right;
      margin-top: 12pt;
      margin-bottom: 12pt;
    }
    
    .page-number {
      position: absolute;
      top: 0.5in;
      right: 1in;
      font-size: 12pt;
    }
    
    /* Ensure each screenplay page is exactly 11 inches */
    .screenplay-page {
      height: 11in;
      width: 8.5in;
      padding: 1in 1in 1in 1.5in;
      box-sizing: border-box;
      page-break-after: always;
      position: relative;
    }
    
    /* Hide page number on first screenplay page */
    .screenplay-page:first-child .page-number {
      display: none;
    }
  </style>
</head>
<body>
`;

  // Add title page
  html += `
  <div class="title-page">
    <div class="title-content">
      <div class="title">${title.toUpperCase()}</div>
      <div>Written by</div>
      <div class="author">${author || 'Anonymous'}</div>
    </div>
    ${contact ? `<div class="contact-section">${contact.split('\n').map(line => `<div>${line}</div>`).join('\n')}</div>` : ''}
  </div>
  
  <div class="screenplay-content">`;

  // Process screenplay content with proper pagination
  let inDialogue = false;
  let pageLineCount = 0;
  let pageNumber = 1;
  let currentPageHtml = `<div class="screenplay-page">`;
  
  // Add page number for pages 2+
  if (pageNumber > 1) {
    currentPageHtml += `<div class="page-number">${pageNumber}.</div>`;
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const prevLine = index > 0 ? lines[index - 1].trim() : '';
    
    // Page break logic
    pageLineCount++;
    if (pageLineCount >= 55 && index < lines.length - 1) {
      // Close current page
      currentPageHtml += `</div>`;
      html += currentPageHtml;
      
      // Start new page
      pageNumber++;
      pageLineCount = 0;
      currentPageHtml = `<div class="screenplay-page">`;
      
      // Add page number for pages 2+
      if (pageNumber > 1) {
        currentPageHtml += `<div class="page-number">${pageNumber}.</div>`;
      }
    }
    
    // Detect element type and apply formatting
    if (/^(INT|EXT|EST)[\.\s]/i.test(trimmed)) {
      // Scene heading
      inDialogue = false;
      currentPageHtml += `<div class="scene-heading">${trimmed}</div>\n`;
    } else if (/^(FADE IN:|FADE OUT\.|FADE TO:|CUT TO:|DISSOLVE TO:)$/i.test(trimmed)) {
      // Transition
      inDialogue = false;
      currentPageHtml += `<div class="transition">${trimmed}</div>\n`;
    } else if (/^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
      // Character name
      inDialogue = true;
      currentPageHtml += `<div class="character">${trimmed}</div>\n`;
    } else if (/^\([^)]+\)$/.test(trimmed) && inDialogue) {
      // Parenthetical
      currentPageHtml += `<div class="parenthetical">${trimmed}</div>\n`;
    } else if (inDialogue && trimmed) {
      // Dialogue
      currentPageHtml += `<div class="dialogue">${trimmed}</div>\n`;
    } else if (!trimmed) {
      // Empty line - might end dialogue
      if (inDialogue && index < lines.length - 1 && !lines[index + 1].trim()) {
        inDialogue = false;
      }
      currentPageHtml += `<br>\n`;
    } else {
      // Action
      inDialogue = false;
      currentPageHtml += `<div class="action">${trimmed}</div>\n`;
    }
  });

  // Close the last page
  currentPageHtml += `</div>`;
  html += currentPageHtml;

  html += `
  </div>
</body>
</html>
`;

  return html;
}

// Export to PDF using @react-pdf/renderer
export async function exportToPDF(project: ScreenplayProject): Promise<void> {
  try {
    // Show progress notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #2563eb;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
    `;
    notification.textContent = 'Generating PDF...';
    document.body.appendChild(notification);

    // Parse the screenplay content
    const elements = ScreenplayParser.parseAdvanced(project.content);
    
    // Create screenplay data structure
    const screenplayData: ScreenplayData = {
      title: project.title,
      author: project.author,
      contact: project.contact,
      elements: elements
    };

    // Generate PDF blob
    const blob = await pdf(React.createElement(ScreenplayDocument, { data: screenplayData })).toBlob();
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Update notification for success
    notification.style.background = '#10b981';
    notification.textContent = 'PDF downloaded successfully!';
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Show error notification
    const errorNotification = document.createElement('div');
    errorNotification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ef4444;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
    `;
    errorNotification.textContent = 'Failed to generate PDF. Please try again.';
    document.body.appendChild(errorNotification);
    
    setTimeout(() => {
      if (document.body.contains(errorNotification)) {
        document.body.removeChild(errorNotification);
      }
    }, 5000);
  }
}

// Export to FDX (Final Draft XML format)
export function exportToFDX(project: ScreenplayProject): void {
  const lines = project.content.split('\n');
  
  let fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
`;

  let currentElement = 'Action';
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const prevLine = index > 0 ? lines[index - 1].trim() : '';
    
    if (!trimmed) {
      // Empty line
      if (currentElement === 'Dialogue') {
        fdx += `    </Paragraph>\n`;
        currentElement = 'Action';
      }
      return;
    }
    
    // Detect element type
    if (/^(INT|EXT|EST)[\.\s]/i.test(trimmed)) {
      if (currentElement === 'Dialogue') {
        fdx += `    </Paragraph>\n`;
      }
      currentElement = 'Scene Heading';
      fdx += `    <Paragraph Type="Scene Heading">\n      <Text>${escapeXML(trimmed)}</Text>\n    </Paragraph>\n`;
    } else if (/^(FADE IN:|FADE OUT\.|FADE TO:|CUT TO:|DISSOLVE TO:)$/i.test(trimmed)) {
      if (currentElement === 'Dialogue') {
        fdx += `    </Paragraph>\n`;
      }
      currentElement = 'Transition';
      fdx += `    <Paragraph Type="Transition">\n      <Text>${escapeXML(trimmed)}</Text>\n    </Paragraph>\n`;
    } else if (/^[A-Z][A-Z0-9\s\-\']{1,30}(\s*\([^)]+\))?$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
      if (currentElement === 'Dialogue') {
        fdx += `    </Paragraph>\n`;
      }
      currentElement = 'Character';
      fdx += `    <Paragraph Type="Character">\n      <Text>${escapeXML(trimmed)}</Text>\n    </Paragraph>\n`;
    } else if (/^\([^)]+\)$/.test(trimmed) && (currentElement === 'Character' || currentElement === 'Dialogue')) {
      currentElement = 'Parenthetical';
      fdx += `    <Paragraph Type="Parenthetical">\n      <Text>${escapeXML(trimmed)}</Text>\n    </Paragraph>\n`;
    } else if (currentElement === 'Character' || currentElement === 'Parenthetical' || currentElement === 'Dialogue') {
      if (currentElement !== 'Dialogue') {
        currentElement = 'Dialogue';
        fdx += `    <Paragraph Type="Dialogue">\n`;
      } else {
        fdx += `      <Text> </Text>\n`;
      }
      fdx += `      <Text>${escapeXML(trimmed)}</Text>\n`;
    } else {
      if (currentElement === 'Dialogue') {
        fdx += `    </Paragraph>\n`;
      }
      currentElement = 'Action';
      fdx += `    <Paragraph Type="Action">\n      <Text>${escapeXML(trimmed)}</Text>\n    </Paragraph>\n`;
    }
  });
  
  if (currentElement === 'Dialogue') {
    fdx += `    </Paragraph>\n`;
  }
  
  fdx += `  </Content>
</FinalDraft>`;

  // Download the file
  downloadFile(`${project.title}.fdx`, fdx, 'application/xml');
}

// Export to plain text
export function exportToText(project: ScreenplayProject): void {
  downloadFile(`${project.title}.txt`, project.content, 'text/plain');
}

// Helper function to escape XML special characters
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper function to download a file
function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}