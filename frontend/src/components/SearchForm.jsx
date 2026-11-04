const inputs = [
  { name: 'city', label: 'City', type: 'text', placeholder: 'Any city' },
  { name: 'keyword', label: 'Description keyword', type: 'text', placeholder: 'e.g. kitchen or Metro' },
  { name: 'minPrice', label: 'Minimum price ($)', type: 'number', placeholder: 'No minimum', min: 0, step: 'any' },
  { name: 'maxPrice', label: 'Maximum price ($)', type: 'number', placeholder: 'No maximum', min: 0, step: 'any' },
  { name: 'minBedrooms', label: 'Minimum bedrooms', type: 'number', placeholder: 'Any', min: 0, step: '1' },
  { name: 'targetBudget', label: 'Target budget ($)', type: 'number', placeholder: 'Rank by recency only', min: 0, step: 'any' },
  { name: 'pageSize', label: 'Results per page', type: 'number', placeholder: '5', min: 1, max: 100, step: '1' },
];

export default function SearchForm({ filters, fieldErrors, loading, onFilterChange, onSearch, onReset }) {
  function handleSubmit(event) {
    event.preventDefault();
    onSearch();
  }

  return (
    <form onSubmit={handleSubmit} className="search-panel">
      <fieldset disabled={loading}>
        <legend>Search listings</legend>
        <div className="filter-grid">
          {inputs.map(input => (
            <div className="field" key={input.name}>
              <label htmlFor={input.name}>{input.label}</label>
              <input
                id={input.name}
                name={input.name}
                type={input.type}
                placeholder={input.placeholder}
                min={input.min}
                max={input.max}
                step={input.step}
                value={filters[input.name]}
                onChange={event => onFilterChange(input.name, event.target.value)}
                aria-invalid={Boolean(fieldErrors[input.name])}
                aria-describedby={fieldErrors[input.name] ? `${input.name}-error` : undefined}
              />
              {fieldErrors[input.name] && (
                <span className="field-error" id={`${input.name}-error`}>
                  {fieldErrors[input.name]}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button type="submit">{loading ? 'Searching…' : 'Search listings'}</button>
          <button className="secondary" type="button" onClick={onReset}>Reset</button>
          <p>Budget affects ranking, not the price range.</p>
        </div>
      </fieldset>
    </form>
  );
}
