export default function Pagination({ page, totalPages, loading, onPageChange }) {
  return (
    <nav aria-label="Result pages" className="pagination">
      <button
        className="secondary"
        disabled={loading || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <span>{totalPages ? `Page ${page} of ${totalPages}` : 'No pages'}</span>
      <button
        className="secondary"
        disabled={loading || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
