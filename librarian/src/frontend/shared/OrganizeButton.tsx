import React, { useState } from "react";
import { useApolloClient, gql } from "@apollo/client";

const PluginApi = (window as any).PluginApi;
const { Button } = PluginApi.libraries.Bootstrap;
const { faBox } = PluginApi.libraries.FontAwesomeSolid;
const Icon = PluginApi.components.Icon;

const SET_ORGANIZED_MUTATION = gql`
  mutation LibrarianSetOrganized($id: ID!) {
    sceneUpdate(input: { id: $id, organized: true }) {
      id
    }
  }
`;

interface OrganizeButtonProps {
  scene: any;
  onOrganized?: (sceneId: string, patchedScene: any) => void;
}

export function OrganizeButton({ scene, onOrganized }: OrganizeButtonProps) {
  const client = useApolloClient();
  const [organizing, setOrganizing] = useState(false);

  async function handleOrganize() {
    setOrganizing(true);
    try {
      await client.mutate({
        mutation: SET_ORGANIZED_MUTATION,
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
