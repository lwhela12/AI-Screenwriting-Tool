import React from 'react';
import { ScreenplayPDFDownloadLink, ScreenplayData, parseScriptToElements } from '../utils/screenplayPDF';

// Example screenplay data with proper formatting
const exampleScreenplay: ScreenplayData = {
  title: 'The Great Adventure',
  author: 'Jane Smith',
  elements: [
    { type: 'scene-heading', text: 'FADE IN:' },
    { type: 'scene-heading', text: 'EXT. MOUNTAIN TRAIL - DAY' },
    { type: 'action', text: 'A narrow, winding trail cuts through dense forest. Morning mist clings to ancient trees. SARAH CHEN (30s), athletic and determined, emerges from the fog, backpack heavy on her shoulders.' },
    { type: 'action', text: 'She pauses, catching her breath, and checks her GPS device.' },
    { type: 'character', text: 'SARAH' },
    { type: 'parenthetical', text: '(to herself)' },
    { type: 'dialogue', text: 'Three more miles. You can do this.' },
    { type: 'action', text: 'A RUSTLING in the bushes nearby. Sarah freezes, hand instinctively moving to the bear spray on her belt.' },
    { type: 'character', text: 'SARAH' },
    { type: 'parenthetical', text: '(louder, authoritative)' },
    { type: 'dialogue', text: 'Hey bear! Just passing through!' },
    { type: 'action', text: 'The rustling stops. After a tense moment, a DEER bounds across the trail and disappears into the forest.' },
    { type: 'action', text: 'Sarah exhales, laughing at herself.' },
    { type: 'character', text: 'SARAH' },
    { type: 'dialogue', text: 'City girl. Still got a lot to learn.' },
    { type: 'transition', text: 'CUT TO:' },
    { type: 'scene-heading', text: 'INT. RANGER STATION - DAY' },
    { type: 'action', text: 'A rustic cabin filled with maps, radio equipment, and rescue gear. RANGER MIKE TORRES (50s), weathered and wise, studies a large topographical map.' },
    { type: 'character', text: 'MIKE' },
    { type: 'parenthetical', text: '(into radio)' },
    { type: 'dialogue', text: 'Base, this is Station Seven. Chen should be reaching checkpoint three within the hour.' },
    { type: 'action', text: 'Static crackles through the radio.' },
    { type: 'character', text: 'RADIO VOICE (V.O.)' },
    { type: 'dialogue', text: 'Copy that, Seven. Weather front moving in faster than expected. Keep us posted.' },
    { type: 'action', text: 'Mike looks out the window at darkening clouds gathering on the horizon.' },
    { type: 'character', text: 'MIKE' },
    { type: 'dialogue', text: 'Will do. This could get interesting.' },
    { type: 'transition', text: 'FADE OUT.' },
  ],
};

export const ScreenplayPDFExample: React.FC = () => {
  // Example of parsing script text
  const scriptText = `
FADE IN:

EXT. CITY STREET - NIGHT

Rain pounds the empty street. A lone FIGURE hurries along, collar turned up against the storm.

JOHN
(shouting over the rain)
Where are you?

He checks his phone. No signal.

CUT TO:
  `;

  const parsedElements = parseScriptToElements(scriptText);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Screenplay PDF Generator Example</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Example 1: Pre-formatted Screenplay</h3>
        <ScreenplayPDFDownloadLink 
          data={exampleScreenplay} 
          fileName="the-great-adventure.pdf"
        >
          <button style={{ 
            padding: '10px 20px', 
            fontSize: '16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}>
            Download "The Great Adventure" PDF
          </button>
        </ScreenplayPDFDownloadLink>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Example 2: Parsed Script Text</h3>
        <ScreenplayPDFDownloadLink 
          data={{
            title: 'Parsed Script',
            author: 'Generated from Text',
            elements: parsedElements
          }} 
          fileName="parsed-script.pdf"
        >
          <button style={{ 
            padding: '10px 20px', 
            fontSize: '16px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}>
            Download Parsed Script PDF
          </button>
        </ScreenplayPDFDownloadLink>
      </div>

      <div style={{ 
        padding: '20px', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '8px',
        marginTop: '30px'
      }}>
        <h3>Screenplay Formatting Specifications</h3>
        <ul>
          <li><strong>Font:</strong> Courier 12pt</li>
          <li><strong>Page Size:</strong> 8.5" x 11" (Letter)</li>
          <li><strong>Margins:</strong> 1.5" left, 1" right, 1" top & bottom</li>
          <li><strong>Character Names:</strong> 3.7" from left edge, ALL CAPS</li>
          <li><strong>Dialogue:</strong> 2.5" from left edge</li>
          <li><strong>Parentheticals:</strong> 3.1" from left edge</li>
          <li><strong>Scene Headings:</strong> ALL CAPS (e.g., INT. LOCATION - TIME)</li>
          <li><strong>Transitions:</strong> Right-aligned, ALL CAPS</li>
        </ul>
      </div>
    </div>
  );
};