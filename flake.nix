{
  description = "Dev shell for the Stash plugins monorepo (Node + pnpm)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      # Building/typechecking/testing each plugin goes through pnpm (see the
      # root README's "Building" section and each plugin's own README) --
      # this just gets the right Node/pnpm versions on PATH. The real
      # build+publish path is .github/workflows/deploy.yml, not a Nix
      # derivation, since that workflow already needs to build every plugin
      # in the workspace (a fixed, single-plugin fetchPnpmDeps derivation
      # doesn't generalize to "however many plugins happen to live here").
      devShells = forEachSystem (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            # zip/unzip: build_site.sh (root) shells out to `zip` to build
            # each plugin's distributable archive, needed to run a local
            # publish preview.
            packages = [ pkgs.nodejs_22 pkgs.pnpm pkgs.zip pkgs.unzip ];
          };
        });
    };
}
