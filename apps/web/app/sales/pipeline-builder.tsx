'use client';

import { useState } from 'react';
import { createSalesPipeline } from './actions';

interface StageDraft {
  key: number;
  name: string;
  probabilityBps: number;
  terminalKind: 'OPEN' | 'WON' | 'LOST';
}

const initialStages: StageDraft[] = [
  { key: 1, name: 'Qualified', probabilityBps: 2500, terminalKind: 'OPEN' },
  { key: 2, name: 'Proposal', probabilityBps: 6000, terminalKind: 'OPEN' },
  { key: 3, name: 'Won', probabilityBps: 10000, terminalKind: 'WON' },
  { key: 4, name: 'Lost', probabilityBps: 0, terminalKind: 'LOST' },
];

export function PipelineBuilder() {
  const [stages, setStages] = useState<StageDraft[]>(initialStages);
  const [nextKey, setNextKey] = useState(5);

  function updateStage(key: number, patch: Partial<StageDraft>) {
    setStages((current) => current.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)));
  }

  function addStage() {
    setStages((current) => [
      ...current,
      { key: nextKey, name: '', probabilityBps: 5000, terminalKind: 'OPEN' },
    ]);
    setNextKey((value) => value + 1);
  }

  function removeStage(key: number) {
    setStages((current) => (current.length > 1 ? current.filter((stage) => stage.key !== key) : current));
  }

  return (
    <form action={createSalesPipeline} className="identity-form">
      <div className="identity-form-grid">
        <div className="identity-field">
          <label htmlFor="sales-pipeline-name">Pipeline name</label>
          <input id="sales-pipeline-name" name="name" required maxLength={200} placeholder="Direct sales" />
        </div>
        <div className="identity-field">
          <label htmlFor="sales-pipeline-description">Description</label>
          <input
            id="sales-pipeline-description"
            name="description"
            maxLength={2000}
            placeholder="Primary new-business pipeline"
          />
        </div>
      </div>
      <label className="identity-checkbox-row">
        <input name="isDefault" type="checkbox" defaultChecked />
        <span>Use as the default active pipeline</span>
      </label>
      <div className="identity-table-wrap">
        <table className="identity-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Probability %</th>
              <th>Outcome</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.key}>
                <td data-label="Stage">
                  <input
                    aria-label={`Stage ${stage.key} name`}
                    name="stageName"
                    required
                    maxLength={120}
                    value={stage.name}
                    onChange={(event) => updateStage(stage.key, { name: event.target.value })}
                  />
                </td>
                <td data-label="Probability %">
                  <input
                    aria-label={`Stage ${stage.key} probability`}
                    name="stageProbabilityPercent"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    required
                    value={stage.probabilityBps / 100}
                    onChange={(event) =>
                      updateStage(stage.key, {
                        probabilityBps: Math.round(Number(event.target.value) * 100),
                      })
                    }
                  />
                </td>
                <td data-label="Outcome">
                  <select
                    aria-label={`Stage ${stage.key} outcome`}
                    name="stageTerminalKind"
                    value={stage.terminalKind}
                    onChange={(event) =>
                      updateStage(stage.key, {
                        terminalKind: event.target.value as StageDraft['terminalKind'],
                      })
                    }
                  >
                    <option value="OPEN">Open</option>
                    <option value="WON">Won</option>
                    <option value="LOST">Lost</option>
                  </select>
                </td>
                <td data-label="Action">
                  <button
                    className="ds-button ds-button--secondary"
                    type="button"
                    onClick={() => removeStage(stage.key)}
                    disabled={stages.length === 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="identity-action-row">
        <button className="ds-button ds-button--secondary" type="button" onClick={addStage}>
          Add stage
        </button>
        <button className="ds-button ds-button--primary" type="submit">
          Create pipeline
        </button>
      </div>
    </form>
  );
}
