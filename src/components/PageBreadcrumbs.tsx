import { Link } from "react-router-dom";
import { Box, Breadcrumbs, Typography } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";

interface Crumb {
  label: string;
  to?: string;
}

interface PageBreadcrumbsProps {
  crumbs: Crumb[];
}

export default function PageBreadcrumbs({ crumbs }: PageBreadcrumbsProps) {
  return (
    <Box sx={{ px: 3, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="inherit" />}>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          if (crumb.to && !isLast) {
            return (
              <Link key={i} to={crumb.to} style={{ textDecoration: "none" }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                >
                  {crumb.label}
                </Typography>
              </Link>
            );
          }
          return (
            <Typography key={i} variant="body2" color="text.primary">
              {crumb.label}
            </Typography>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
}
