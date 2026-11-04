import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

// Mock only the HTTP boundary. The Python suite tests actual search/ranking logic.
const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;

function results(page = 1, total = 12, pageSize = 5) {
  return {
    items: Array.from({ length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) }, (_, i) => ({
      id: String((page - 1) * pageSize + i), source: 'MLS_A',
      address: `${(page - 1) * pageSize + i + 1} Main St`, city: 'Springfield',
      state: 'VA', zip: '22150', price: 450000, bedrooms: 3,
      listedDate: '2026-09-04', status: 'active', description: 'Updated kitchen.',
      relevanceScore: 87.123456,
    })),
    total, page, pageSize, totalPages: Math.ceil(total / pageSize),
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function openApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: '12 listings found' });
  return user;
}

const searchButton = () => screen.getByRole('button', { name: 'Search listings' });
const lastQuery = () => new URL(String(fetchMock.mock.calls.at(-1)[0]), 'http://localhost').searchParams;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(response(results()));
  globalThis.fetch = fetchMock;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

test('loads initial results and displays listing details with rounded scores', async () => {
  await openApp();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(lastQuery().get('page')).toBe('1');
  expect(lastQuery().get('pageSize')).toBe('5');
  expect(screen.getAllByRole('article')).toHaveLength(5);
  expect(screen.getByRole('heading', { name: '1 Main St' })).toBeVisible();
  expect(screen.getAllByText('$450,000')).toHaveLength(5);
  expect(screen.getAllByText(/3 bedrooms/)).toHaveLength(5);
  expect(screen.getAllByText('87.12', { exact: false })).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
});

test('navigates pages and disables buttons at boundaries', async () => {
  const user = await openApp();
  fetchMock.mockResolvedValueOnce(response(results(2)));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 of 3');
  expect(lastQuery().get('page')).toBe('2');
  fetchMock.mockResolvedValueOnce(response(results(3)));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 3 of 3');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fetchMock.mockResolvedValueOnce(response(results(2)));
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText('Page 2 of 3');
  expect(lastQuery().get('page')).toBe('2');
});

test('submits all filters, trims text, and starts a new search at page one', async () => {
  const user = await openApp();
  fetchMock.mockResolvedValueOnce(response(results(2)));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 of 3');
  await user.type(screen.getByLabelText('City', { exact: true }), ' springFIELD ');
  await user.type(screen.getByLabelText('Description keyword'), ' kitchen ');
  await user.type(screen.getByLabelText('Minimum price ($)'), '400000');
  await user.type(screen.getByLabelText('Maximum price ($)'), '526000');
  await user.type(screen.getByLabelText('Minimum bedrooms'), '3');
  await user.type(screen.getByLabelText('Target budget ($)'), '450000');
  await user.clear(screen.getByLabelText('Results per page'));
  await user.type(screen.getByLabelText('Results per page'), '10');
  const match = results(1, 1, 10);
  match.items[0].address = '456 Oak Ave';
  fetchMock.mockResolvedValueOnce(response(match));
  await user.click(searchButton());
  await screen.findByRole('heading', { name: '1 listing found' });
  expect(Object.fromEntries(lastQuery())).toEqual({
    page: '1', pageSize: '10', city: 'springFIELD', keyword: 'kitchen',
    minPrice: '400000', maxPrice: '526000', minBedrooms: '3', targetBudget: '450000',
  });
  expect(screen.getByRole('heading', { name: '456 Oak Ave' })).toBeVisible();
});

test('shows an empty state with disabled pagination', async () => {
  const user = await openApp();
  await user.type(screen.getByLabelText('City', { exact: true }), 'Unknown');
  fetchMock.mockResolvedValueOnce(response(results(1, 0)));
  await user.click(searchButton());
  await screen.findByRole('heading', { name: '0 listings found' });
  expect(screen.getByText(/No listings on this page/)).toBeVisible();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
});

test('pagination keeps submitted filters when draft inputs change', async () => {
  const user = await openApp();
  await user.type(screen.getByLabelText('Target budget ($)'), '450000');
  await user.click(searchButton());
  await screen.findByRole('heading', { name: '12 listings found' });
  await user.type(screen.getByLabelText('City', { exact: true }), 'Unknown');
  fetchMock.mockResolvedValueOnce(response(results(2)));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 of 3');
  expect(lastQuery().get('targetBudget')).toBe('450000');
  expect(lastQuery().has('city')).toBe(false);
});

test('shows field errors, clears them on editing, and resets the form', async () => {
  const user = await openApp();
  await user.type(screen.getByLabelText('Minimum price ($)'), '500000');
  await user.type(screen.getByLabelText('Maximum price ($)'), '400000');
  fetchMock.mockResolvedValueOnce(response({ error: {
    message: 'Please correct the search inputs.',
    fields: { maxPrice: 'Maximum price must be at least the minimum price.' },
  } }, 400));
  await user.click(searchButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('Please correct the search inputs.');
  expect(screen.getByLabelText('Maximum price ($)')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('Maximum price must be at least the minimum price.')).toBeVisible();
  await user.clear(screen.getByLabelText('Maximum price ($)'));
  expect(screen.queryByText('Maximum price must be at least the minimum price.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reset' }));
  await screen.findByRole('heading', { name: '12 listings found' });
  expect(screen.getByLabelText('Minimum price ($)')).toHaveValue(null);
  expect(screen.getByLabelText('Results per page')).toHaveValue(5);
  expect(Object.fromEntries(lastQuery())).toEqual({ page: '1', pageSize: '5' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test.each(['network', 'server'])('recovers from a %s failure on retry', async kind => {
  const user = await openApp();
  if (kind === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  else fetchMock.mockResolvedValueOnce(response({}, 500));
  await user.click(searchButton());
  expect(await screen.findByRole('alert')).toHaveTextContent(
    kind === 'network' ? 'Could not reach the listing service' : 'The listing service is unavailable',
  );
  await user.click(searchButton());
  await screen.findByRole('heading', { name: '12 listings found' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('disables controls while loading and prevents overlapping requests', async () => {
  let resolve;
  fetchMock.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading listings');
  const button = screen.getByRole('button', { name: /Searching/ });
  expect(button).toBeDisabled();
  expect(screen.getByLabelText('City', { exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  await user.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(response(results())); });
  await waitFor(() => expect(searchButton()).toBeEnabled());
  expect(screen.getByLabelText('City', { exact: true })).toBeEnabled();
});
