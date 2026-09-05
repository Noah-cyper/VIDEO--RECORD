import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { exists } from './jsonstore'

const file = () => join(app.getPath('userData'), 'secrets.bin')

/**
 * Khoá API không bao giờ đi qua IPC ngược về renderer và không nằm trong settings.json.
 * safeStorage dùng keychain của hệ điều hành; máy nào không có thì thà từ chối lưu còn hơn
 * ghi khoá ra đĩa dưới dạng chữ thường.
 */
export function secureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export async function setApiKey(key: string): Promise<void> {
  if (!key.trim()) return clearApiKey()
  if (!secureStorageAvailable()) {
    throw new Error('Hệ điều hành không cung cấp kho khoá an toàn, nên không lưu khoá API.')
  }
  await fs.writeFile(file(), safeStorage.encryptString(key.trim()))
}

export async function getApiKey(): Promise<string | null> {
  if (!(await exists(file())) || !secureStorageAvailable()) return null
  try {
    return safeStorage.decryptString(await fs.readFile(file()))
  } catch {
    return null
  }
}

export async function clearApiKey(): Promise<void> {
  await fs.rm(file(), { force: true })
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null
}
