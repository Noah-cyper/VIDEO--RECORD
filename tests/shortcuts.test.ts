import { describe, expect, it } from 'vitest'
import { isOverlayCommand, OVERLAY_COMMANDS, prettyAccelerator, SHORTCUTS } from '@shared/shortcuts'

describe('phím tắt toàn cục', () => {
  it('mỗi phím tắt gắn với đúng một lệnh, không trùng phím', () => {
    const accelerators = SHORTCUTS.map((s) => s.accelerator)
    expect(new Set(accelerators).size).toBe(accelerators.length)
  })

  it('hiện ra cho người đọc chứ không hiện tên nội bộ của Electron', () => {
    expect(prettyAccelerator('CommandOrControl+Shift+R', 'win32')).toBe('Ctrl+Shift+R')
    expect(prettyAccelerator('CommandOrControl+Shift+R', 'darwin')).toBe('⌘⇧R')
  })
})

describe('lệnh phát từ ô chỉ báo', () => {
  it('nhận đúng ba lệnh thao tác bản ghi', () => {
    expect([...OVERLAY_COMMANDS]).toEqual(['pause', 'stop', 'bookmark'])
    for (const cmd of OVERLAY_COMMANDS) expect(isOverlayCommand(cmd)).toBe(true)
  })

  it('không có lệnh nào ẩn hay tắt chỉ báo - FR-08 nằm ở tầng này, không phải ở tầng UI', () => {
    for (const forbidden of ['hide', 'window:hide', 'close', 'toggle-record', 'quit']) {
      expect(isOverlayCommand(forbidden)).toBe(false)
    }
  })

  it('giá trị lạ từ renderer bị chặn, kể cả khi không phải chuỗi', () => {
    for (const junk of [null, undefined, 42, {}, ['stop'], 'STOP', ' stop ']) {
      expect(isOverlayCommand(junk)).toBe(false)
    }
  })
})
