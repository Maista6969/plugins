import React, { useState } from "react";
import { useApolloClient, gql } from "@apollo/client";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faBox } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

const SET_ORGANIZED_MUTATIONS: Record<string, any> = {
  scenes: gql`
    mutation LibrarianSetSceneOrganized($id: ID!) {
      sceneUpdate(input: { id: $id, organized: true }) {
        id
      }
    }
  `,
  galleries: gql`
    mutation LibrarianSetGalleryOrganized($id: ID!) {
      galleryUpdate(input: { id: $id, organized: true }) {
        id
      }
    }
  `,
  images: gql`
    mutation LibrarianSetImageOrganized($id: ID!) {
      imageUpdate(input: { id: $id, organized: true }) {
        id
      }
    }
  `,
};

interface OrganizeButtonProps {
  scene: any;
  onOrganized?: (sceneId: string, patchedScene: any) => void;
  entityType?: string;
}

export function OrganizeButton({
  scene,
  onOrganized,
  entityType,
}: OrganizeButtonProps) {
  const client = useApolloClient();
  const [organizing, setOrganizing] = useState(false);

  async function handleOrganize() {
    setOrganizing(true);
    try {
      await client.mutate({
        mutation:
          SET_ORGANIZED_MUTATIONS[entityType || "scenes"] ||
          SET_ORGANIZED_MUTATIONS.scenes,
        variables: { id: scene.id },
      });
      onOrganized?.(scene.id, { ...scene, organized: true });
    } finally {
      setOrganizing(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="minimal organized-button not-organized"
      title="Organized"
      disabled={organizing}
      onClick={handleOrganize}
    >
      <Icon icon={faBox} />
    </Button>
  );
}
