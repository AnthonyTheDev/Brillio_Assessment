const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function ListingCard({ listing }) {
  return (
    <article className="listing">
      <div className="listing-top">
        <span className="status">{listing.status}</span>
        <span className="source">{listing.source}</span>
      </div>
      <p className="price">{money.format(listing.price)}</p>
      <h3>{listing.address}</h3>
      <p className="location">{listing.city}, {listing.state} {listing.zip}</p>
      <p className="details">
        {listing.bedrooms} {listing.bedrooms === 1 ? 'bedroom' : 'bedrooms'}{' '}
        <span aria-hidden="true">·</span> Listed{' '}
        <time dateTime={listing.listedDate}>{listing.listedDate}</time>
      </p>
      <p className="description">{listing.description}</p>
      <div className="score">
        <span>Relevance score</span>
        <strong>{listing.relevanceScore.toFixed(2)} <small>/ 100</small></strong>
      </div>
    </article>
  );
}
