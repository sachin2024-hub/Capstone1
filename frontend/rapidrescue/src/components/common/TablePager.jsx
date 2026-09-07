import { PAGE_SIZE_OPTIONS, resolvePageSize } from './tablePageSize';
import styles from './TablePager.module.css';

export default function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  const count = Number(total) || 0;
  const size = resolvePageSize(pageSize, count);
  const totalPages = Math.max(1, Math.ceil(count / size));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = count === 0 ? 0 : (currentPage - 1) * size + 1;
  const end = Math.min(currentPage * size, count);

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.info}>
          {count === 0 ? 'Showing 0' : `Showing ${start}–${end} of ${count}`}
        </span>
        <label className={styles.limit}>
          <span>Show</span>
          <select
            value={pageSize === 'all' ? 'all' : size}
            onChange={(e) => {
              const value = e.target.value;
              onPageSizeChange(value === 'all' ? 'all' : Number(value));
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n === 'all' ? 'All' : n}</option>
            ))}
          </select>
          <span>rows</span>
        </label>
      </div>
      <div className={styles.btns}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>
        <span className={styles.pageNum}>Page {currentPage} of {totalPages}</span>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={currentPage >= totalPages || count === 0}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
