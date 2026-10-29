declare module "*.svg?component" {
  import type { FunctionComponent, SVGProps } from "react";
  const Component: FunctionComponent<SVGProps<SVGSVGElement>>;
  export default Component;
}

declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
