// GitHub Actions commits its generated news snapshot back to the repository.
// Clear a locally inherited Vercel flag so the writer targets data/ instead of /tmp.
delete process.env.VERCEL;
process.env.NEWS_STORAGE_MODE = "git";

const { runNewsAutomation } = await import("../app/lib/news-system.js");

try {
  const result = await runNewsAutomation();
  console.log(JSON.stringify({
    status: result.job?.status,
    published: result.published?.map((article) => article.slug) || [],
    need: result.need,
    errors: result.errors || []
  }, null, 2));
  process.exit(0);
} catch (error) {
  console.error(`[scheduled-news] ${error?.message || error}`);
  process.exit(1);
}
