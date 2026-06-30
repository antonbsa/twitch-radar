import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

const dataDir = path.resolve(process.cwd(), "data")

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true })
}

async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  await ensureDataDir()

  try {
    const raw = await readFile(path.join(dataDir, fileName), "utf8")
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback
    }

    throw error
  }
}

async function writeJsonFile<T>(fileName: string, value: T): Promise<void> {
  await ensureDataDir()

  const target = path.join(dataDir, fileName)
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  await rename(temp, target)
}

export async function readCollection<T>(fileName: string): Promise<T[]> {
  return readJsonFile<T[]>(fileName, [])
}

export async function writeCollection<T>(
  fileName: string,
  value: T[],
): Promise<void> {
  await writeJsonFile(fileName, value)
}
