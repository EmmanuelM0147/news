import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: resolve(__dirname, '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.error('Missing environment variable: VITE_SUPABASE_URL')
  process.exit(1)
}

if (!supabaseAnonKey) {
  console.error('Missing environment variable: VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const TOTAL_NEWS = 1000
const BATCH_SIZE = 100
const TAG_POOL_SIZE = 30
const TAGS_PER_NEWS = { min: 1, max: 4 }
const PICTURES_PER_NEWS = { min: 1, max: 3 }

const createTagPool = () => {
  const tags = new Set()

  while (tags.size < TAG_POOL_SIZE) {
    const candidate = faker.hacker.noun().toLowerCase().replace(/\s+/g, '-')
    tags.add(candidate)
  }

  return Array.from(tags)
}

const chooseRandom = (source, min, max) => {
  const count = faker.number.int({ min, max })
  return faker.helpers.arrayElements(source, count)
}

const insertTags = async (tags) => {
  if (tags.length === 0) {
    return {}
  }

  const payload = tags.map((tag) => ({ name: tag }))
  const { error: upsertError } = await supabase.from('tags').upsert(payload, { onConflict: 'name' })

  if (upsertError) {
    throw new Error(`Failed to upsert tags: ${upsertError.message}`)
  }

  const { data: tagRows, error: selectError } = await supabase.from('tags').select('id, name').in('name', tags)

  if (selectError) {
    throw new Error(`Failed to fetch tags: ${selectError.message}`)
  }

  return Object.fromEntries(tagRows.map((row) => [row.name, row.id]))
}

const buildNewsRecord = () => ({
  title: faker.company.catchPhrase(),
  text: faker.lorem.paragraphs({ min: 3, max: 6 }, '\n\n'),
})

const buildPictureRecords = (newsId, count) =>
  Array.from({ length: count }, (_, index) => {
    const seed = faker.string.alphanumeric(10)
    return {
      news_id: newsId,
      url: `https://picsum.photos/seed/${seed}-${index}/800/480`,
    }
  })

const seed = async () => {
  console.log(`Seeding ${TOTAL_NEWS} news records…`)

  const tagPool = createTagPool()
  const tagMap = await insertTags(tagPool)
  const tagNames = Object.keys(tagMap)

  let createdCount = 0

  while (createdCount < TOTAL_NEWS) {
    const remaining = TOTAL_NEWS - createdCount
    const batchSize = Math.min(BATCH_SIZE, remaining)

    const newsBatch = Array.from({ length: batchSize }, () => buildNewsRecord())
    const { data: insertedNews, error: insertError } = await supabase.from('news').insert(newsBatch).select('id')

    if (insertError) {
      throw new Error(`Failed to insert news batch at count ${createdCount}: ${insertError.message}`)
    }

    const tagRelations = []
    const pictureRows = []

    for (const news of insertedNews) {
      const selectedTags = chooseRandom(tagNames, TAGS_PER_NEWS.min, TAGS_PER_NEWS.max)
      for (const tagName of selectedTags) {
        tagRelations.push({ news_id: news.id, tag_id: tagMap[tagName] })
      }

      const picturesCount = faker.number.int({ min: PICTURES_PER_NEWS.min, max: PICTURES_PER_NEWS.max })
      pictureRows.push(...buildPictureRecords(news.id, picturesCount))
    }

    if (tagRelations.length > 0) {
      const { error: tagError } = await supabase.from('news_tags').insert(tagRelations)
      if (tagError) {
        throw new Error(`Failed to insert news_tag relations: ${tagError.message}`)
      }
    }

    if (pictureRows.length > 0) {
      const { error: pictureError } = await supabase.from('pictures').insert(pictureRows)
      if (pictureError) {
        throw new Error(`Failed to insert pictures: ${pictureError.message}`)
      }
    }

    createdCount += insertedNews.length
    console.log(`Inserted ${createdCount}/${TOTAL_NEWS}`)

    // Give the Supabase REST API a tiny breather to avoid rate limiting.
    await sleep(150)
  }

  console.log('✅ Seeding complete!')
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  })

