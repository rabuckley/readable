import React from "react";
import "./index.css";

interface ReadableContentProps {
  title: string;
  content: string;
  byline?: string;
  siteName?: string;
}

const ReadableContent: React.FC<ReadableContentProps> = ({
  title,
  content,
  byline,
  siteName,
}) => {
  return (
    <div className="bg-oat-50 grid min-h-screen grid-cols-[1fr_minmax(0,var(--container-3xl))_1fr] gap-4 dark:bg-neutral-900">
      <div className="prose prose-neutral dark:prose-invert md:prose-lg prose-blockquote:not-italic prose-headings:font-semibold prose-headings:font-sans prose-lead:text-neutral-900 dark:prose-lead:text-neutral-300 prose-pre:bg-neutral-100 prose-pre:text-neutral-800 dark:prose-pre:text-neutral-300 dark:prose-pre:bg-neutral-800 prose-code:font-medium prose-code:font-mono col-span-1 col-start-2 my-12 font-serif">
        <h1>{title}</h1>
        {(byline || siteName) && (
          <div className="mb-4 text-neutral-600 dark:text-neutral-300">
            {byline && <span>{byline}</span>}
            {byline && siteName && <span> · </span>}
            {siteName && <span>{siteName}</span>}
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
};

export default ReadableContent;
