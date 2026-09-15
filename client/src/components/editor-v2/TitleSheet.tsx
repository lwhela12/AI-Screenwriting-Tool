import React from 'react';

export interface TitlePageData {
  title: string;
  author: string;
  contact: string;
}

interface TitleSheetProps {
  data: TitlePageData;
  onChange: (data: TitlePageData) => void;
}

/**
 * The title page, shown as the first sheet above the script. Title, author
 * and contact details are edited in place; the sheet uses the same paper
 * geometry as the script pages.
 */
export const TitleSheet: React.FC<TitleSheetProps> = ({ data, onChange }) => {
  const update = (patch: Partial<TitlePageData>) => onChange({ ...data, ...patch });

  return (
    <div className="title-sheet" aria-label="Title page">
      <div className="title-sheet-center">
        <input
          className="title-sheet-title"
          value={data.title}
          placeholder="TITLE"
          spellCheck={false}
          onChange={e => update({ title: e.target.value })}
        />
        <div className="title-sheet-byline">Written by</div>
        <input
          className="title-sheet-author"
          value={data.author}
          placeholder="Author"
          onChange={e => update({ author: e.target.value })}
        />
      </div>
      <textarea
        className="title-sheet-contact"
        value={data.contact}
        placeholder={'Contact\nAddress\nPhone\nEmail'}
        rows={6}
        onChange={e => update({ contact: e.target.value })}
      />
    </div>
  );
};

export default TitleSheet;
