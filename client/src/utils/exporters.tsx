import React from 'react';
import ReactDOM from 'react-dom/client';
import { pdf } from '@react-pdf/renderer';
import { ScreenplayProject } from '../components/ProjectManager';
import { ScreenplayDocument, ScreenplayData, parseScriptToElements } from './screenplayPDF';
import { ScreenplayParser } from './screenplayParser';

// Export to PDF using @react-pdf/renderer
export async function exportToPDF(project: ScreenplayProject): Promise<void> {
  try {
    // Parse the screenplay content
    const elements = ScreenplayParser.parseAdvanced(project.content);
    
    // Create screenplay data
    const screenplayData: ScreenplayData = {
      title: project.title,
      author: project.author,
      elements: elements
    };

    // Generate PDF blob
    const blob = await pdf(<ScreenplayDocument data={screenplayData} />).toBlob();
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show success notification
    showNotification('PDF exported successfully!', 'success');
  } catch (error) {
    console.error('Error generating PDF:', error);
    showNotification('Failed to generate PDF. Please try again.', 'error');
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
  showNotification('FDX exported successfully!', 'success');
}

// Export to plain text
export function exportToText(project: ScreenplayProject): void {
  downloadFile(`${project.title}.txt`, project.content, 'text/plain');
  showNotification('Text file exported successfully!', 'success');
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

// Helper function to show notifications
function showNotification(message: string, type: 'success' | 'error'): void {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    transition: opacity 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Fade out and remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}