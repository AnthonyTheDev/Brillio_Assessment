import { useEffect, useRef, useState } from 'react';
import SearchForm from './components/SearchForm';
import SearchResults from './components/SearchResults';

const initialFilters = {
  minPrice: '', maxPrice: '', minBedrooms: '', city: '', keyword: '',
  targetBudget: '', pageSize: '5',
};

export default function App() {
  const [draft, setDraft] = useState(initialFilters);
  const [submitted, setSubmitted] = useState(initialFilters);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const inFlight = useRef(false);
  const controller = useRef(null);

  async function search(filters, page) {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    setFieldErrors({});
    setResults(null);
    const query = new URLSearchParams({ page: String(page) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) query.set(key, value.trim());
    });
    try {
      const response = await fetch(`/api/listings?${query}`, { signal: request.signal });
      if (!response.ok) {
        if (response.status === 400) {
          const body = await response.json();
          setFieldErrors(body.error?.fields ?? {});
          throw new Error(body.error?.message ?? 'Please check your search inputs.');
        }
        throw new Error('The listing service is unavailable. Please try again.');
      }
      const body = await response.json();
      setResults(body);
      setSubmitted(filters);
    } catch (cause) {
      if (request.signal.aborted) return;
      setError(cause instanceof TypeError || cause instanceof SyntaxError
        ? 'Could not reach the listing service. Check that the backend is running, then try again.'
        : cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      if (!request.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void search(initialFilters, 1);
    return () => controller.current?.abort();
  }, []);

  function changeFilter(name, value) {
    setDraft(previous => ({ ...previous, [name]: value }));
    setFieldErrors(previous => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }

  function resetSearch() {
    setDraft(initialFilters);
    void search(initialFilters, 1);
  }

  return (
    <main>
      <header>
        <p className="eyebrow">NORTHERN VIRGINIA · PROPERTY SEARCH</p>
        <h1>Find your next place.</h1>
        <p className="intro">Search across property feeds, with the newest and closest to your budget ranked first.</p>
      </header>

      <SearchForm
        filters={draft}
        fieldErrors={fieldErrors}
        loading={loading}
        onFilterChange={changeFilter}
        onSearch={() => void search({ ...draft }, 1)}
        onReset={resetSearch}
      />

      <SearchResults
        results={results}
        loading={loading}
        error={error}
        onPageChange={page => void search(submitted, page)}
      />
      <footer>Listings from multiple feeds are shown separately. Availability and prices may differ by source.</footer>
    </main>
  );
}
