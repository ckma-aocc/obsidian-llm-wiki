type FileRecord = Record<string, string>;

function toFile(path: string) {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  return { path, name, extension } as any;
}

export function createFakeVault(initialFiles: FileRecord = {}) {
  const files: FileRecord = { ...initialFiles };
  const dirs = new Set<string>();

  Object.keys(files).forEach((path) => {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  });

  const vault: any = {
    adapter: {
      exists: jest.fn(async (path: string) => path in files || dirs.has(path)),
      read: jest.fn(async (path: string) => {
        if (!(path in files)) {
          throw new Error(`File does not exist: ${path}`);
        }
        return files[path];
      }),
      write: jest.fn(async (path: string, content: string) => {
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join("/"));
        }
        files[path] = content;
      }),
      mkdir: jest.fn(async (path: string) => {
        dirs.add(path);
      }),
      remove: jest.fn(async (path: string) => {
        delete files[path];
      })
    },
    cachedRead: jest.fn(async (file: any) => files[file.path] ?? ""),
    readBinary: jest.fn(async (_file: any) => new ArrayBuffer(0)),
    create: jest.fn(async (path: string, content: string) => {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
      files[path] = content;
    }),
    modify: jest.fn(async (file: any, content: string) => {
      files[file.path] = content;
    }),
    getAbstractFileByPath: jest.fn((path: string) => {
      if (path in files) return toFile(path);
      return null;
    }),
    getFiles: jest.fn(() => Object.keys(files).filter((p) => p.endsWith(".md")).map((p) => toFile(p))),
    on: jest.fn(() => ({ id: "evt" }))
  };

  return {
    vault,
    files,
    dirs
  };
}