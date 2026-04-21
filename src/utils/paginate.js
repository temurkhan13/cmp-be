/**
 * Paginate Supabase query results
 * Matches mongoose-paginate-v2 response format for backwards compatibility
 *
 * @param {string} table - Table name
 * @param {object} options - { page, limit, sort, filter, select }
 * @param {object} supabase - Supabase client
 * @returns {object} { results, page, limit, totalPages, totalResults }
 */
const paginate = async (table, options, supabase) => {
  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 10;
  const offset = (page - 1) * limit;

  // Count total
  let countQuery = supabase.from(table).select("*", { count: "exact", head: true });
  if (options.filter) {
    for (const [key, value] of Object.entries(options.filter)) {
      if (value !== undefined && value !== null) {
        countQuery = countQuery.eq(key, value);
      }
    }
  }
  const { count: totalResults } = await countQuery;

  // Fetch page
  let query = supabase.from(table).select(options.select || "*");
  if (options.filter) {
    for (const [key, value] of Object.entries(options.filter)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    }
  }

  // Sort
  if (options.sort) {
    const sortField = options.sort.startsWith("-") ? options.sort.slice(1) : options.sort;
    const ascending = !options.sort.startsWith("-");
    query = query.order(sortField, { ascending });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data: results, error } = await query;
  if (error) throw error;

  const totalPages = Math.ceil(totalResults / limit);

  return {
    results: results || [],
    page,
    limit,
    totalPages,
    totalResults,
  };
};

module.exports = paginate;
