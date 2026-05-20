async function runInPool(items, limit, fn) {
  const results = []
  const executing = new Set()

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item))
    results.push(p)
    executing.add(p)

    const _clean = p.finally(() => executing.delete(p))
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  return Promise.all(results)
}

runInPool([1, 2, 3, 4, 5], 2, async (item) => {
  console.log(`Start ${item}`)
  await new Promise((r) => setTimeout(r, 100))
  console.log(`End ${item}`)
  return item * 2
}).then((res) => console.log('Done', res))
