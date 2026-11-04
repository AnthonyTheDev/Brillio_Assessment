import ListingCard from './ListingCard';
import Pagination from './Pagination';

export default function SearchResults({ results, loading, error, onPageChange }) {
  return (
    <section aria-label="Search results" aria-busy={loading}>
      {loading && <p className="notice" role="status">Loading listings…</p>}

      {error && (
        <div className="notice error" role="alert">
          <strong>Search could not be completed.</strong>
          <p>{error}</p>
          <p>Review the inputs and select Search listings to try again.</p>
        </div>
      )}

      {results && (
        <>
          <div className="results-heading" aria-live="polite">
            <h2>{results.total} {results.total === 1 ? 'listing' : 'listings'} found</h2>
            <span>Sorted by relevance</span>
          </div>

          {results.items.length === 0 ? (
            <p className="notice">
              No listings on this page. Try a different city, wider price range, or fewer filters.
            </p>
          ) : (
            <div className="listing-grid">
              {results.items.map(listing => (
                <ListingCard key={`${listing.source}:${listing.id}`} listing={listing} />
              ))}
            </div>
          )}

          <Pagination
            page={results.page}
            totalPages={results.totalPages}
            loading={loading}
            onPageChange={onPageChange}
          />
        </>
      )}
    </section>
  );
}
