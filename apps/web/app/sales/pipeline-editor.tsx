'use client';

import { useState } from 'react';
import { createSalesPipeline } from './actions';

type Category = 'OPEN' | 'WON' | 'LOST';
interface StageDraft {
  key: number;
  code: string;
  name: string;
  category: Category;
  sortOrder: number;
  probability: number;
}

const defaults: StageDraft[] = [
  { key: 1, code: 'QUALIFIED', name: 'Qualified', category: 'OPEN', sortOrder: 10, probability: 2500 },
  { key: 2, code: 'PROPOSAL', name: 'Proposal', category: 'OPEN', sortOrder: 20, probability: 6000 },
  { key: 3, code: 'WON', name: 'Won', category: 'WON', sortOrder: 90, probability: 10000 },
  { key: 4, code: 'LOST', name: 'Lost', category: 'LOST', sortOrder: 100, probability: 0 },
];

export function PipelineEditor() {
  const [stages, setStages] = useState(defaults);
  const [nextKey, setNextKey] = useState(5);

  function update(key: number, patch: Partial<StageDraft>) {
    setStages((current) => current.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage)));
  }

  function addStage() {
    const maxOrder = Math.max(...stages.map((stage) => stage.sortOrder), 0);
    setStages((current) => [
      ...current,
      {
        key: nextKey,
        code: `STAGE_${String(nextKey)}`,
        name: 'New stage',
        category: 'OPEN',
        sortOrder: maxOrder + 10,
        probability: 5000,
      },
    ]);
    setNextKey((value) => value + 1);
  }

  return (
    <form action={createSalesPipeline} className="identity-form">
      <div className="identity-form-grid">
        <div className="identity-field">
          <label htmlFor="sales-pipeline-name">Pipeline name</label>
          <input id="sales-pipeline-name" name="name" required maxLength={200} />
        </div>
        <label className="identity-field">
          <span>Default pipeline</span>
          <input name="isDefault" type="checkbox" defaultChecked />
        </label>
      </div>
      <div className="identity-table-wrap">
        <table className="identity-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Order</th>
              <th>Probability bps</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.key}>
                <td data-label="Code">
                  <input
                    aria-label={`Stage ${String(stage.key)} code`}
                    name="stageCode"
                    pattern="[A-Z][A-Z0-9_]{1,63}"
                    value={stage.code}
                    onChange={(event) => update(stage.key, { code: event.target.value.toUpperCase() })}
                    required
                  />
                </td>
                <td data-label="Name">
                  <input
                    aria-label={`Stage ${String(stage.key)} name`}
                    name="stageName"
                    value={stage.name}
                    onChange={(event) => update(stage.key, { name: event.target.value })}
                    required
                  />
                </td>
                <td data-label="Category">
                  <select
                    aria-label={`Stage ${String(stage.key)} category`}
                    name="stageCategory"
                    value={stage.category}
                    onChange={(event) => update(stage.key, { category: event.target.value as Category })}
                  >
                    <option value="OPEN">Open</option>
                    <option value="WON">Won</option>
                    <option value="LOST">Lost</option>
                  </select>
                </td>
                <td data-label="Order">
                  <input
                    aria-label={`Stage ${String(stage.key)} order`}
                    name="stageSortOrder"
                    type="number"
                    min={0}
                    max={10000}
                    value={stage.sortOrder}
                    onChange={(event) => update(stage.key, { sortOrder: Number(event.target.value) })}
                    required
                  />
                </td>
                <td data-label="Probability bps">
                  <input
                    aria-label={`Stage ${String(stage.key)} probability`}
                    name="stageProbability"
                    type="number"
                    min={0}
                    max={10000}
                    value={stage.probability}
                    onChange={(event) => update(stage.key, { probability: Number(event.target.value) })}
                    required
                  />
                </td>
                <td data-label="Action">
                  {stage.category === 'OPEN' && stages.filter((item) => item.category === 'OPEN').length > 1 ? (
                    <button
                      className="ds-button ds-button--secondary"
                      type="button"
                      onClick={() => setStages((current) => current.filter((item) => item.key !== stage.key))}
                    >
                      Remove
                    </button>
                  ) : (
                    'Required'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="identity-role-list">
        <button className="ds-button ds-button--secondary" type="button" onClick={addStage}>
          Add open stage
        </button>
        <button className="ds-button ds-button--primary" type="submit">
          Create pipeline
        </button>
      </div>
    </form>
  );
}
