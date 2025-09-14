import * as React from "react";
import { PaperProvider } from "react-native-paper";
import ProjectPortal from "../components/ProjectPortal";

export default function ProManage() {
  return (
    <PaperProvider>
      <ProjectPortal />
    </PaperProvider>
  );
}

export const options = {
  title: "Projects",
};
