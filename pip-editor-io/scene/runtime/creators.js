const createProjection = (mode) => {
  const projectionNodeId = `scene.view.${mode}`;
  return {
    id: `scene.create-${mode}`,
    label: mode === "quadrant" ? "象限视图" : "管道视图",
    description: `打开同一 Scene 的${mode === "quadrant" ? "空间象限" : "时间管道"}投影`,
    category: "Scene 投影", icon: mode === "quadrant" ? "⌗" : "⌁",
    accepts({ graph, rootNodeIds }) { return Boolean(graph.nodes[projectionNodeId]) && !rootNodeIds.includes(projectionNodeId); },
    create() {
      return { addRootNodeIds: [projectionNodeId], preferredProjection: { projectionId: projectionNodeId, width: 1120, height: 720 } };
    },
  };
};

export const sceneCreators = [createProjection("quadrant"), createProjection("tube")];
