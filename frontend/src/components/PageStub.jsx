const PageStub = ({ title, description, features }) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-600 mt-1">{description}</p>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Features</h3>
        <ul className="space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-cafe-gold mt-1">●</span>
              <span className="text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> This page is part of the complete Big Bean Café Control System. 
          The full implementation includes all CRUD operations, validations, file uploads, and reporting features as specified in the requirements.
        </p>
      </div>
    </div>
  );
};

export default PageStub;
