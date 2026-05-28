export class Plugin {
  app: any = { vault: mockVault, workspace: mockWorkspace };
  loadData = jest.fn().mockResolvedValue({});
  saveData = jest.fn().mockResolvedValue(undefined);
  addCommand = jest.fn();
  addRibbonIcon = jest.fn().mockReturnValue({ addClass: jest.fn() });
  registerView = jest.fn();
  registerEvent = jest.fn();
  addSettingTab = jest.fn();
  registerInterval = jest.fn();
}

export class ItemView {
  app: any;
  containerEl = document.createElement("div");
  contentEl = document.createElement("div");
  constructor(leaf: any) {
    this.app = leaf?.app ?? { vault: mockVault, workspace: mockWorkspace };
  }
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl = document.createElement("div");
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {
    return this;
  }
  addDropdown() {
    return this;
  }
  addToggle() {
    return this;
  }
  addExtraButton() {
    return this;
  }
}

export class Notice {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

export const MarkdownRenderer = {
  render: jest.fn().mockImplementation(async (_app: any, markdown: string, el: HTMLElement) => {
    el.textContent = markdown;
  })
};

export class TFile {
  path: string;
  name: string;
  extension: string;
  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
    this.extension = this.name.split(".").pop() ?? "";
  }
}

export const WorkspaceLeaf = class {};

export const mockVault = {
  cachedRead: jest.fn().mockResolvedValue(""),
  readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
  create: jest.fn().mockResolvedValue(undefined),
  modify: jest.fn().mockResolvedValue(undefined),
  getAbstractFileByPath: jest.fn().mockReturnValue(null),
  getFiles: jest.fn().mockReturnValue([]),
  on: jest.fn().mockReturnValue({ id: "mock-event" }),
  adapter: {
    read: jest.fn().mockResolvedValue(""),
    write: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(undefined)
  }
};

export const mockWorkspace = {
  getLeavesOfType: jest.fn().mockReturnValue([]),
  getRightLeaf: jest.fn().mockReturnValue({
    setViewState: jest.fn().mockResolvedValue(undefined)
  }),
  revealLeaf: jest.fn().mockResolvedValue(undefined)
};