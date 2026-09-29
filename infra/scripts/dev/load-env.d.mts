export declare const REPO_ROOT: string

export declare function parseDotEnv(filePath: string): Record<string, string>

export interface DevEnv {
  vars: Record<string, string>
  developmentVars: Record<string, string>
  envFilePaths: string[]
  apiPort: string
  inspectorPort: string
  webPort: string
  publicUrl: string
}

export declare function loadDevEnv(repoRoot?: string): DevEnv
