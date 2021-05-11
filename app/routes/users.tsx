import React from "react";
import { Outlet } from "react-router";
import { Link, NavLink } from "react-router-dom";
import { useRouteData } from "../../src/LoaderContext";
import { LoaderFn } from "../../src/routeTypes";
import { User, database } from "../database";
import "./users.css";

type Data = (User & { slug: string })[];

export const loader: LoaderFn<Data> = async () => {
  return [...database].map(([slug, user]) => {
    return { ...user, slug };
  });
};

export default function Users() {
  const routeData = useRouteData<Data>();

  return (
    <div>
      Hello, this will not override, but won't be visible in{" "}
      <Link to="register">the registration page</Link>.
      <div>
        <NavLink className="nav-link" to={"not-found"}>
          Missing member
        </NavLink>
        {routeData.map((project) => (
          <React.Fragment key={project.slug}>
            <NavLink className="nav-link" to={project.slug}>
              {project.name}
            </NavLink>
          </React.Fragment>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
