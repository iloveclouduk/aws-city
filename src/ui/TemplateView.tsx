import { useState } from 'react';
import { templateBody } from '@/world/templateBodies';
import { feel } from './feedback';

/**
 * "Show the CloudFormation": the YAML a design becomes when it's built, to read, copy or save (a local download;
 * nothing is uploaded). Folded until asked for, so the card stays calm.
 */
export function TemplateView({ templateId, title }: { templateId: string; title: string }) {
  const body = templateBody(templateId);
  const [copied, setCopied] = useState(false);
  if (!body) return null;
  const save = () => {
    const url = URL.createObjectURL(new Blob([body], { type: 'text/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `aws-city-${templateId}.yaml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    feel.tap();
  };
  return (
    <details className="template-view">
      <summary>Show the CloudFormation</summary>
      {/* Scrolls, so it must take keyboard focus to be read (axe scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <pre className="workshop-cmd template-yaml" aria-label={`CloudFormation template for ${title}`} tabIndex={0}>
        {body}
      </pre>
      <div className="actions">
        <button className="btn tiny" onClick={() => void navigator.clipboard?.writeText(body).then(() => (setCopied(true), feel.tap()))}>
          {copied ? 'Copied' : 'Copy YAML'}
        </button>
        <button className="btn tiny" onClick={save}>
          Download .yaml
        </button>
      </div>
    </details>
  );
}
